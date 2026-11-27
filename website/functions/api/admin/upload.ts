import { jsonResponse, verifyAdminRequest, type Env } from '../_shared';

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const authed = await verifyAdminRequest(context.request, context.env);
  if (!authed) return jsonResponse({ error: 'Unauthorized' }, 401);

  if (!context.env.LENS_R2) {
    return jsonResponse(
      { error: 'LENS_R2 bucket binding is not configured in Cloudflare Pages -> Settings -> Functions.' },
      503
    );
  }

  const url = new URL(context.request.url);
  const action = url.searchParams.get('action') ?? 'start';

  if (action === 'start') {
    const rawName = (url.searchParams.get('filename') || 'New-Eden-Lens-Setup.exe').trim();
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const r2Key = `installers/${Date.now()}-${safeName}`;

    const mpu = await context.env.LENS_R2.createMultipartUpload(r2Key, {
      httpMetadata: {
        contentType: 'application/octet-stream',
        contentDisposition: `attachment; filename="${safeName}"`
      }
    });

    return jsonResponse({ ok: true, r2Key: mpu.key, uploadId: mpu.uploadId });
  }

  if (action === 'complete') {
    const r2Key = url.searchParams.get('r2Key');
    const uploadId = url.searchParams.get('uploadId');
    if (!r2Key || !uploadId) {
      return jsonResponse({ error: 'Missing r2Key or uploadId.' }, 400);
    }

    const body = (await context.request.json().catch(() => null)) as {
      parts?: Array<{ partNumber: number; etag: string }>;
    } | null;

    if (!body?.parts || body.parts.length === 0) {
      return jsonResponse({ error: 'Missing uploaded parts.' }, 400);
    }

    const mpu = context.env.LENS_R2.resumeMultipartUpload(r2Key, uploadId);
    await mpu.complete(body.parts);

    return jsonResponse({
      ok: true,
      r2Key,
      downloadUrl: `/api/download?file=${encodeURIComponent(r2Key)}`
    });
  }

  return jsonResponse({ error: 'Unsupported action.' }, 400);
};

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
  const action = url.searchParams.get('action');

  if (action === 'part') {
    const r2Key = url.searchParams.get('r2Key');
    const uploadId = url.searchParams.get('uploadId');
    const partNumber = Number(url.searchParams.get('partNumber'));
    if (!r2Key || !uploadId || !Number.isFinite(partNumber) || partNumber < 1) {
      return jsonResponse({ error: 'Invalid multipart part parameters.' }, 400);
    }
    if (!context.request.body) {
      return jsonResponse({ error: 'Empty part body.' }, 400);
    }

    const mpu = context.env.LENS_R2.resumeMultipartUpload(r2Key, uploadId);
    const part = await mpu.uploadPart(partNumber, context.request.body);
    return jsonResponse({ ok: true, partNumber: part.partNumber, etag: part.etag });
  }

  // Fallback single-PUT for small files
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
