import { getStoredReleases, jsonResponse, type Env } from './_shared';

export const onRequestGet = async (context: { env: Env }): Promise<Response> => {
  const releases = await getStoredReleases(context.env);
  return jsonResponse({ releases });
};

