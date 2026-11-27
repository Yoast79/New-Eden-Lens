import { createSessionToken, jsonResponse, timingSafeEqualStr, type Env } from '../_shared';

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const expected = context.env.ADMIN_PASSWORD;
  if (!expected) {
    return jsonResponse({ error: 'Admin password is not configured in Cloudflare secrets.' }, 503);
  }
  try {
    const body = (await context.request.json()) as { password?: string };
    const provided = body.password ?? '';
    if (!timingSafeEqualStr(provided, expected)) {
      return jsonResponse({ error: 'Invalid credentials.' }, 401);
    }
    const token = await createSessionToken(context.env);
    return jsonResponse(
      { ok: true },
      200,
      {
        'Set-Cookie': `nel_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`
      }
    );
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400);
  }
};

