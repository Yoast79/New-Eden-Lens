import { jsonResponse } from '../_shared';

export const onRequestPost = async (): Promise<Response> => {
  return jsonResponse(
    { ok: true },
    200,
    {
      'Set-Cookie': 'nel_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    }
  );
};

