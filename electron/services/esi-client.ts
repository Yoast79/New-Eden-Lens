import { ESI_BASE_URL } from '@shared/constants/eve';
import type { EsiStatusSnapshot } from '@shared/types/esi';
import type { EsiRequestOptions } from '@shared/types/ipc';
import type { AppRepository } from '../db/repositories/appRepo';
import type { PkceAuthService } from './auth-pkce';

const MAX_CONCURRENT_ESI = 3;
const MIN_DISPATCH_GAP_MS = 50;

export class EsiClient {
  private errorLimitRemain: number | null = null;
  private errorLimitReset: number | null = null;
  private rateLimitedUntil: number | null = null;
  private activeRequests = 0;
  private lastError: string | null = null;
  private lastDispatchAt = 0;
  private waitQueue: Array<() => void> = [];

  constructor(
    private readonly appRepo: AppRepository,
    private readonly authService: PkceAuthService
  ) {}

  private async acquireSlot(): Promise<void> {
    if (this.activeRequests >= MAX_CONCURRENT_ESI) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }
    this.activeRequests += 1;

    // Enforce global cooldown if ESI previously returned 429 or low error limit
    const now = Date.now();
    if (this.rateLimitedUntil && now < this.rateLimitedUntil) {
      const waitMs = this.rateLimitedUntil - now;
      if (waitMs > 60_000) {
        this.releaseSlot();
        throw new Error(`ESI cooldown active (${Math.ceil(waitMs / 1000)}s remaining)`);
      }
      await sleep(waitMs);
    }

    if (this.errorLimitRemain !== null && this.errorLimitRemain <= 15 && this.errorLimitReset) {
      const resetWait = Math.min(this.errorLimitReset * 1000, 30_000);
      await sleep(resetWait);
      this.errorLimitRemain = null;
    }

    const sinceLast = Date.now() - this.lastDispatchAt;
    if (sinceLast < MIN_DISPATCH_GAP_MS) {
      await sleep(MIN_DISPATCH_GAP_MS - sinceLast);
    }
    this.lastDispatchAt = Date.now();
  }

  private releaseSlot(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    const next = this.waitQueue.shift();
    if (next) next();
  }

  getStatus(): EsiStatusSnapshot {
    const settings = this.appRepo.getSettings();
    const now = Date.now();
    const activeCooldown = this.rateLimitedUntil && now < this.rateLimitedUntil;
    return {
      compatibilityDate: settings.esiCompatibilityDate,
      errorLimitRemain: this.errorLimitRemain,
      errorLimitReset: this.errorLimitReset,
      rateLimitedUntil: activeCooldown ? this.rateLimitedUntil : null,
      activeRequests: this.activeRequests,
      lastError: activeCooldown ? this.lastError : null
    };
  }

  async request<T>(path: string, options: EsiRequestOptions = {}, retryCount = 0): Promise<T> {
    const settings = this.appRepo.getSettings();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${ESI_BASE_URL}${normalizedPath}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Compatibility-Date': settings.esiCompatibilityDate,
      'User-Agent': 'NewEdenLens/0.1.0 (Local Desktop Omni-Tool)'
    };

    if (options.characterId) {
      const token = await this.authService.getValidAccessToken(options.characterId);
      headers.Authorization = `Bearer ${token}`;
    }

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    await this.acquireSlot();
    let shouldRetry429 = false;
    let shouldRetry401 = false;
    let retryWaitMs = 0;
    try {
      const res = await fetch(url.toString(), {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined
      });

      const remainHeader = res.headers.get('X-ESI-Error-Limit-Remain');
      const resetHeader = res.headers.get('X-ESI-Error-Limit-Reset');
      if (remainHeader !== null) this.errorLimitRemain = Number(remainHeader);
      if (resetHeader !== null) this.errorLimitReset = Number(resetHeader);

      if (res.status === 429) {
        const retryAfterSec = Math.max(5, Number(res.headers.get('Retry-After') ?? '15') || 15);
        this.rateLimitedUntil = Date.now() + retryAfterSec * 1000;
        this.lastError = `429 Too Many Requests (cooldown ${retryAfterSec}s)`;
        if (retryCount < 1 && retryAfterSec <= 30 && (!options.method || options.method === 'GET')) {
          shouldRetry429 = true;
          retryWaitMs = retryAfterSec * 1000;
        } else {
          throw new Error(this.lastError);
        }
      } else if (res.status === 401 && options.characterId && retryCount < 1) {
        shouldRetry401 = true;
      } else if (!res.ok) {
        const errBody = await res.text();
        this.lastError = `ESI ${res.status} on ${normalizedPath}: ${errBody.slice(0, 200)}`;
        throw new Error(this.lastError);
      } else {
        this.lastError = null;
        this.rateLimitedUntil = null;
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }
    } finally {
      this.releaseSlot();
    }

    if (shouldRetry429) {
      await sleep(retryWaitMs);
      return this.request<T>(path, options, retryCount + 1);
    }
    if (shouldRetry401 && options.characterId) {
      await this.authService.refreshAccessToken(options.characterId);
      return this.request<T>(path, options, retryCount + 1);
    }
    throw new Error(this.lastError ?? 'ESI request failed');
  }

  async requestAllPages<T>(path: string, options: EsiRequestOptions = {}, retryCount = 0): Promise<T[]> {
    const firstQuery = { ...(options.query ?? {}), page: 1 };
    const settings = this.appRepo.getSettings();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${ESI_BASE_URL}${normalizedPath}`);
    for (const [k, v] of Object.entries(firstQuery)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Compatibility-Date': settings.esiCompatibilityDate,
      'User-Agent': 'NewEdenLens/0.1.0 (Local Desktop Omni-Tool)'
    };
    if (options.characterId) {
      const token = await this.authService.getValidAccessToken(options.characterId);
      headers.Authorization = `Bearer ${token}`;
    }

    await this.acquireSlot();
    let firstPageItems: T[] = [];
    let totalPages = 1;
    let shouldRetry429 = false;
    let shouldRetry401 = false;
    let retryWaitMs = 0;
    try {
      const res = await fetch(url.toString(), { method: 'GET', headers });
      const remainHeader = res.headers.get('X-ESI-Error-Limit-Remain');
      const resetHeader = res.headers.get('X-ESI-Error-Limit-Reset');
      if (remainHeader !== null) this.errorLimitRemain = Number(remainHeader);
      if (resetHeader !== null) this.errorLimitReset = Number(resetHeader);

      if (res.status === 429) {
        const retryAfterSec = Math.max(5, Number(res.headers.get('Retry-After') ?? '15') || 15);
        this.rateLimitedUntil = Date.now() + retryAfterSec * 1000;
        this.lastError = `429 Too Many Requests (cooldown ${retryAfterSec}s)`;
        if (retryCount < 1 && retryAfterSec <= 30) {
          shouldRetry429 = true;
          retryWaitMs = retryAfterSec * 1000;
        } else {
          throw new Error(this.lastError);
        }
      } else if (res.status === 401 && options.characterId && retryCount < 1) {
        shouldRetry401 = true;
      } else if (!res.ok) {
        const errBody = await res.text();
        this.lastError = `ESI ${res.status} on ${normalizedPath}: ${errBody.slice(0, 200)}`;
        throw new Error(this.lastError);
      } else {
        totalPages = Math.max(1, Number(res.headers.get('X-Pages') ?? '1') || 1);
        firstPageItems = (await res.json()) as T[];
        this.lastError = null;
        this.rateLimitedUntil = null;
      }
    } finally {
      this.releaseSlot();
    }

    if (shouldRetry429) {
      await sleep(retryWaitMs);
      return this.requestAllPages<T>(path, options, retryCount + 1);
    }
    if (shouldRetry401 && options.characterId) {
      await this.authService.refreshAccessToken(options.characterId);
      return this.requestAllPages<T>(path, options, retryCount + 1);
    }

    if (totalPages <= 1) return firstPageItems;

    const all = [...firstPageItems];
    for (let p = 2; p <= totalPages; p++) {
      const arr = await this.request<T[]>(path, {
        ...options,
        query: { ...(options.query ?? {}), page: p }
      }).catch(() => [] as T[]);
      if (Array.isArray(arr)) all.push(...arr);
    }
    return all;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

