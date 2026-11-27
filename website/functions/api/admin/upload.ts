import { jsonResponse, verifyAdminRequest, type Env } from '../_shared';

export const onRequestPut = async (context: { request: Request; env: Env }): Promise<Response> => {
  const authed = await verifyAdminRequest(context.request, context.env);
  if (!authed) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (!context.env.LENS_R2) {
    return jsonResponse(
      { error: 'LENS_R2 bucket binding is not configured in Cloudflare Pages -> Settings -> Functions.' },
      503
    );
  }

  const url = new URL(context.request.url);
  const rawName = (url.searchParams.get('filename') || 'New-Eden-Lens-Setup.exe').trim();
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '-');
  const r2Key = `installers/${Date.now()}-${safeName}`;

  if (!context.request.body) {
    return jsonResponse({ error: 'Empty upload body.' }, 400);
  }

  await context.env.LENS_R2.put(r2Key, context.request.body, {
    httpMetadata: {
      contentType: 'application/octet-stream',
      contentDisposition: `attachment; filename="${safeName}"`
    }
  });

  return jsonResponse({
    ok: true,
    r2Key,
    downloadUrl: `/api/download?file=${encodeURIComponent(r2Key)}`
  });
};
