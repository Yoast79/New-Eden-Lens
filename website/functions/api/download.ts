import { getStoredReleases, jsonResponse, type Env } from './_shared';

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const url = new URL(context.request.url);
  const requestedKey = url.searchParams.get('file');
  const releases = await getStoredReleases(context.env);
  const latest = releases[0];
  const r2Key = requestedKey || latest?.r2Key;

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

  if (r2Key && context.env.LENS_R2) {
    const obj = await context.env.LENS_R2.get(r2Key);
    if (obj && obj.body) {
      const filename = r2Key.split('/').pop() || 'New-Eden-Lens-Setup.exe';
      return new Response(obj.body, {
        status: 200,
        headers: {
          'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(obj.size),
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
  }

  if (latest?.downloadUrl && latest.downloadUrl !== '/api/download' && !latest.downloadUrl.startsWith('/api/download?')) {
    return Response.redirect(latest.downloadUrl, 302);
  }

  return jsonResponse(
    {
      error: 'No installer file has been uploaded to the R2 bucket yet. Upload an installer in /admin.'
    },
    404
  );
};
