export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface Env {
  LENS_KV?: KVNamespaceLike;
  DISCORD_CONTACT_WEBHOOK_URL?: string;
  DISCORD_UPDATES_WEBHOOK_URL?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
}

export interface ReleaseEntry {
  id: string;
  version: string;
  title: string;
  date: string;
  downloadUrl: string;
  sha256?: string;
  fileSize?: string;
  virusTotalUrl?: string;
  notes: string;
}

export const DEFAULT_RELEASES: ReleaseEntry[] = [
  {
    id: 'rel-0-2-0',
    version: 'v0.2.0',
    title: 'Tactical Maps, Multi-Tracker Intel & Structures Hub',
    date: '2026-11-27',
    downloadUrl: 'https://github.com/Yoast79/New-Eden-Lens/releases/latest',
    fileSize: '~118 MB',
    notes: [
      '+ Navigation & Maps hub with 2.5D Map, Flat Map, Route Planner, Thera/Turnur, and static Structure Browser (5,211 NPC stations)',
      '+ Live Chatlog Intel (IntelTracker) with multi-tracker split screen, custom WebAudio sounds, and Popout Overlay badges',
      '+ Structures module with My Structures fuel monitor, reinforce/attack warnings, and Custom Timers',
      '+ Killboard live stream & lookup, Market Appraisal, LP Conversion, Ship Fitter, and Fleet Planner',
      '* Full EVE SSO (PKCE) with local-only SQLite storage'
    ].join('\n')
  }
];

export function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {})
    }
  });
}

export async function getStoredReleases(env: Env): Promise<ReleaseEntry[]> {
  if (!env.LENS_KV) return DEFAULT_RELEASES;
  const raw = await env.LENS_KV.get('releases');
  if (!raw) return DEFAULT_RELEASES;
  try {
    const parsed = JSON.parse(raw) as ReleaseEntry[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RELEASES;
  } catch {
    return DEFAULT_RELEASES;
  }
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= ab[i] ^ bb[i];
  }
  return diff === 0;
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createSessionToken(env: Env): Promise<string> {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD || '';
  const exp = Date.now() + 1000 * 60 * 60 * 12; // 12h
  const payload = `admin.${exp}`;
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

export async function verifyAdminRequest(request: Request, env: Env): Promise<boolean> {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secret) return false;
  const cookieHeader = request.headers.get('Cookie') ?? '';
  const match = /(?:^|;\s*)nel_admin=([^;]+)/.exec(cookieHeader);
  if (!match) return false;
  const parts = decodeURIComponent(match[1]).split('.');
  if (parts.length !== 3) return false;
  const [role, expStr, sig] = parts;
  if (role !== 'admin') return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = await hmacSign(secret, `${role}.${expStr}`);
  return timingSafeEqualStr(sig, expected);
}

