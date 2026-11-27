import { jsonResponse, type Env } from './_shared';

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  if (!context.env.LENS_R2) {
    return jsonResponse({ error: 'R2 not bound.' }, 503);
  }
  const url = new URL(context.request.url);
  const key = url.searchParams.get('key');
  if (!key || !key.startsWith('screenshots/')) {
    return jsonResponse({ error: 'Invalid media key.' }, 400);
  }
  const obj = await context.env.LENS_R2.get(key);
  if (!obj || !obj.body) {
    return jsonResponse({ error: 'Not found.' }, 404);
  }
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/png',
      'Cache-Control': 'public, max-age=86400'
    }
  });
};

