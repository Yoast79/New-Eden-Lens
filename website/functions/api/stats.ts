import { getStoredReleases, jsonResponse, type Env } from './_shared';

export const onRequestGet = async (context: { env: Env }): Promise<Response> => {
  const releases = await getStoredReleases(context.env);
  let downloads = 0;
  if (context.env.LENS_KV) {
    const raw = await context.env.LENS_KV.get('downloads');
    downloads = Number(raw || '0') || 0;
  }
  return jsonResponse({
    downloads,
    latestRelease: releases[0] ?? null
  });
};

