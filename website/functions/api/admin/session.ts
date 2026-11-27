import { jsonResponse, verifyAdminRequest, type Env } from '../_shared';

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const authenticated = await verifyAdminRequest(context.request, context.env);
  return jsonResponse({ authenticated });
};

