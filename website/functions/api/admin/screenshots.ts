import {
  getStoredScreenshots,
  jsonResponse,
  verifyAdminRequest,
  type Env,
  type ScreenshotDestination,
  type ScreenshotEntry
} from '../_shared';

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const authed = await verifyAdminRequest(context.request, context.env);
  if (!authed) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!context.env.LENS_R2 || !context.env.LENS_KV) {
    return jsonResponse({ error: 'LENS_R2 and LENS_KV must be bound in Cloudflare Pages.' }, 503);
  }

  try {
    const form = await context.request.formData();
    const file = form.get('file');
    const title = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const destination = String(form.get('destination') ?? 'gallery') as ScreenshotDestination;

    if (!(file instanceof File)) {
      return jsonResponse({ error: 'Image file is required.' }, 400);
    }

    const safeName = (file.name || 'screenshot.png').replace(/[^a-zA-Z0-9._-]/g, '-');
    const r2Key = `screenshots/${Date.now()}-${safeName}`;

    await context.env.LENS_R2.put(r2Key, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'image/png'
      }
    });

    const entry: ScreenshotEntry = {
      id: `shot-${Date.now()}`,
      title: title || safeName,
      description,
      destination,
      r2Key,
      imageUrl: `/api/media?key=${encodeURIComponent(r2Key)}`,
      createdAt: Date.now()
    };

    const existing = await getStoredScreenshots(context.env);
    const updated = [entry, ...existing];
    await context.env.LENS_KV.put('screenshots', JSON.stringify(updated));

    return jsonResponse({ ok: true, screenshot: entry, screenshots: updated });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Screenshot upload failed.' },
      500
    );
  }
};

export const onRequestDelete = async (context: { request: Request; env: Env }): Promise<Response> => {
  const authed = await verifyAdminRequest(context.request, context.env);
  if (!authed) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!context.env.LENS_KV) return jsonResponse({ error: 'LENS_KV not bound.' }, 503);

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);

  const existing = await getStoredScreenshots(context.env);
  const next = existing.filter((s) => s.id !== id);
  await context.env.LENS_KV.put('screenshots', JSON.stringify(next));
  return jsonResponse({ ok: true, screenshots: next });
};
