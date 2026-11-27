import { getStoredScreenshots, jsonResponse, type Env } from './_shared';

export const onRequestGet = async (context: { env: Env }): Promise<Response> => {
  const screenshots = await getStoredScreenshots(context.env);
  return jsonResponse({ screenshots });
};

