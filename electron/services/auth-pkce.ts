import crypto from 'crypto';
import http from 'http';
import { shell } from 'electron';
import {
  DEFAULT_ESI_SCOPES,
  EVE_SSO_AUTHORIZE_URL,
  EVE_SSO_TOKEN_URL
} from '@shared/constants/eve';
import type { CharacterRecord } from '@shared/types/esi';
import type { AppRepository } from '../db/repositories/appRepo';
import type { CharacterRepository } from '../db/repositories/characterRepo';

export const PKCE_CALLBACK_PORT = 14580;
export const PKCE_REDIRECT_URI = `http://127.0.0.1:${PKCE_CALLBACK_PORT}/callback`;

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length < 2) throw new Error('Invalid EVE SSO JWT access token');
  const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}

export class PkceAuthService {
  private refreshPromises = new Map<number, Promise<string>>();

  constructor(
    private readonly appRepo: AppRepository,
    private readonly characterRepo: CharacterRepository
  ) {}

  async login(scopes?: string[], accountId?: number | null): Promise<CharacterRecord> {
    const settings = this.appRepo.getSettings();
    const clientId = settings.esiClientId.trim();
    if (!clientId) {
      throw new Error(
        'EVE Developer Client ID is not configured. Open Settings and enter your Client ID (Callback URL: ' +
          PKCE_REDIRECT_URI +
          ').'
      );
    }

    const scopeList = scopes && scopes.length > 0 ? scopes : [...DEFAULT_ESI_SCOPES];
    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
    const codeChallenge = base64UrlEncode(
      crypto.createHash('sha256').update(codeVerifier).digest()
    );
    const state = base64UrlEncode(crypto.randomBytes(16));

    const authUrl = new URL(EVE_SSO_AUTHORIZE_URL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', PKCE_REDIRECT_URI);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', scopeList.join(' '));
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    const code = await this.waitForCallbackCode(state, authUrl.toString());

    const tokenRes = await fetch(EVE_SSO_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        code_verifier: codeVerifier
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`EVE SSO token exchange failed (${tokenRes.status}): ${text}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const payload = decodeJwtPayload(tokenData.access_token);
    const sub = String(payload.sub ?? '');
    const match = /CHARACTER:EVE:(\d+)/.exec(sub);
    if (!match) {
      throw new Error(`Unexpected EVE SSO subject claim: ${sub}`);
    }

    const characterId = Number(match[1]);
    const characterName = String(payload.name ?? `Capsuleer ${characterId}`);
    const grantedScopes = Array.isArray(payload.scp)
      ? payload.scp.map(String)
      : typeof payload.scp === 'string'
        ? payload.scp.split(' ').filter(Boolean)
        : scopeList;

    const expiresAt = Date.now() + tokenData.expires_in * 1000;

    return this.characterRepo.upsertCharacter({
      characterId,
      characterName,
      accountId: accountId ?? null,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: expiresAt,
      scopes: grantedScopes
    });
  }

  async getValidAccessToken(characterId: number): Promise<string> {
    const tokens = this.characterRepo.getTokens(characterId);
    if (!tokens) {
      throw new Error(`Character ${characterId} is not authenticated`);
    }

    const fiveMinutes = 5 * 60 * 1000;
    if (tokens.accessToken && tokens.tokenExpiresAt - Date.now() > fiveMinutes) {
      return tokens.accessToken;
    }

    return this.refreshAccessToken(characterId);
  }

  async refreshAccessToken(characterId: number): Promise<string> {
    const existing = this.refreshPromises.get(characterId);
    if (existing) return existing;

    const task = (async () => {
      const tokens = this.characterRepo.getTokens(characterId);
      if (!tokens) throw new Error(`Character ${characterId} not found`);

      const settings = this.appRepo.getSettings();
      const clientId = settings.esiClientId.trim();
      if (!clientId) {
        throw new Error('EVE Developer Client ID is required to refresh tokens.');
      }

      const res = await fetch(EVE_SSO_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
          client_id: clientId
        })
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Token refresh failed (${res.status}): ${body}`);
      }

      const data = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      const nextExpiresAt = Date.now() + data.expires_in * 1000;
      const nextRefresh = data.refresh_token ?? tokens.refreshToken;
      this.characterRepo.updateTokens(characterId, data.access_token, nextRefresh, nextExpiresAt);
      return data.access_token;
    })();

    this.refreshPromises.set(characterId, task);
    try {
      return await task;
    } finally {
      this.refreshPromises.delete(characterId);
    }
  }

  private waitForCallbackCode(expectedState: string, authUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error('EVE SSO login timed out after 3 minutes.'));
      }, 180_000);

      const server = http.createServer((req, res) => {
        if (!req.url) return;
        const url = new URL(req.url, `http://127.0.0.1:${PKCE_CALLBACK_PORT}`);
        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const err = url.searchParams.get('error');
        const state = url.searchParams.get('state');
        const code = url.searchParams.get('code');

        if (err) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderCallbackHtml(false, `Authorization denied: ${err}`));
          cleanup();
          reject(new Error(`EVE SSO error: ${err}`));
          return;
        }

        if (!code || state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderCallbackHtml(false, 'Invalid OAuth2 state or missing code.'));
          cleanup();
          reject(new Error('Invalid EVE SSO callback state or missing authorization code'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderCallbackHtml(true, 'Capsuleer linked. You may close this browser tab.'));
        cleanup();
        resolve(code);
      });

      const cleanup = () => {
        clearTimeout(timeout);
        server.close();
      };

      server.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start local SSO callback listener on port ${PKCE_CALLBACK_PORT}: ${err.message}`));
      });

      server.listen(PKCE_CALLBACK_PORT, '127.0.0.1', () => {
        void shell.openExternal(authUrl);
      });
    });
  }
}

function renderCallbackHtml(ok: boolean, message: string): string {
  const accent = ok ? '#00F0FF' : '#EF4444';
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>New Eden Lens — EVE SSO</title></head>
<body style="margin:0;background:#0B0E14;color:#E2E8F0;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;">
  <div style="border:1px solid #232D3F;background:#131822;padding:28px 36px;max-width:460px;text-align:center;">
    <div style="color:${accent};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:10px;">New Eden Lens // ESI Auth</div>
    <div style="font-size:16px;font-weight:600;margin-bottom:8px;">${ok ? 'Authentication Successful' : 'Authentication Failed'}</div>
    <div style="font-size:13px;color:#94A3B8;">${message}</div>
  </div>
</body>
</html>`;
}

