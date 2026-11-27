import { getStoredReleases, type Env } from './_shared';

export const onRequestGet = async (context: { env: Env }): Promise<Response> => {
  const releases = await getStoredReleases(context.env);
  const latest = releases[0];
  const targetUrl = latest?.downloadUrl || 'https://github.com/Yoast79/New-Eden-Lens/releases/latest';

  if (context.env.LENS_KV) {
    try {
      const currentRaw = await context.env.LENS_KV.get('downloads');
      const current = Number(currentRaw || '0');
      const next = Number.isFinite(current) ? current + 1 : 1;
      await context.env.LENS_KV.put('downloads', String(next));
    } catch {
      // do not block download on KV write error
    }
  }

  return Response.redirect(targetUrl, 302);
};

