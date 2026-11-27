export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface R2ObjectLike {
  body: ReadableStream | null;
  size: number;
  httpEtag?: string;
  httpMetadata?: { contentType?: string };
}

export interface R2MultipartUploadLike {
  key: string;
  uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream | ArrayBuffer | string): Promise<{ partNumber: number; etag: string }>;
  complete(uploadedParts: Array<{ partNumber: number; etag: string }>): Promise<unknown>;
}

export interface R2BucketLike {
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string | null,
    options?: { httpMetadata?: { contentType?: string; contentDisposition?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: { contentType?: string; contentDisposition?: string } }
  ): Promise<R2MultipartUploadLike>;
  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUploadLike;
}

export interface Env {
  LENS_KV?: KVNamespaceLike;
  LENS_R2?: R2BucketLike;
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
  r2Key?: string;
  fileSize?: string;
  virusTotalUrl?: string;
  notes: string;
}

export type ScreenshotDestination =
  | 'hero'
  | 'gallery'
  | 'maps'
  | 'intel'
  | 'local-intel'
  | 'killboard'
  | 'market'
  | 'fitting'
  | 'fleets'
  | 'structures'
  | 'skills'
  | 'assets'
  | 'pilot'
  | 'wormhole'
  | 'overlay';

export interface ScreenshotEntry {
  id: string;
  title: string;
  description: string;
  destination: ScreenshotDestination;
  imageUrl: string;
  r2Key: string;
  createdAt: number;
}

export const DEFAULT_RELEASES: ReleaseEntry[] = [
  {
    id: 'rel-0-2-0',
    version: 'v0.2.0',
    title: 'Tactical Maps, Multi-Tracker Intel & Structures Hub',
    date: '2026-11-27',
    downloadUrl: '/api/download',
    fileSize: '~118 MB',
    notes:
      '<ul><li><strong>Navigation &amp; Maps:</strong> 2.5D Map, Flat Map, Route Planner, Thera/Turnur, and static Structure Browser (5,211 NPC stations).</li><li><strong>Live Chatlog Intel:</strong> Multi-tracker split screen, custom WebAudio alerts, and Popout Overlay badges.</li><li><strong>Structures:</strong> My Structures fuel monitor, reinforce/attack warnings, and Custom Timers.</li></ul>'
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

export async function getStoredScreenshots(env: Env): Promise<ScreenshotEntry[]> {
  if (!env.LENS_KV) return [];
  const raw = await env.LENS_KV.get('screenshots');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ScreenshotEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

export function htmlToDiscordMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gis, '**$2**')
    .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gis, '*$2*')
    .replace(/<u[^>]*>(.*?)<\/u>/gis, '__$1__')
    .replace(/<(s|strike|del)[^>]*>(.*?)<\/\1>/gis, '~~$2~~')
    .replace(/<code[^>]*>(.*?)<\/code>/gis, '`$1`')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
