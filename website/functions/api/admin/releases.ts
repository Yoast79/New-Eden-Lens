import {
  getStoredReleases,
  htmlToDiscordMarkdown,
  jsonResponse,
  verifyAdminRequest,
  type Env,
  type ReleaseEntry
} from '../_shared';

async function postReleaseToDiscord(
  env: Env,
  requestUrl: string,
  entry: ReleaseEntry
): Promise<{ posted: boolean; error?: string }> {
  if (!env.DISCORD_UPDATES_WEBHOOK_URL) {
    return {
      posted: false,
      error: 'DISCORD_UPDATES_WEBHOOK_URL secret is not set in Cloudflare Pages Environment Variables.'
    };
  }

  const origin = new URL(requestUrl).origin;
  const downloadPageUrl = `${origin}/#download`;
  const directDownloadUrl = `${origin}/api/download`;
  const description = htmlToDiscordMarkdown(entry.notes).slice(0, 3800) || entry.title;

  const fields = [
    { name: 'Direct Download', value: `[Download ${entry.version}](${directDownloadUrl})`, inline: true },
    { name: 'Download Page', value: `[View Details](${downloadPageUrl})`, inline: true },
    { name: 'Release Date', value: entry.date, inline: true }
  ];
  if (entry.fileSize) fields.push({ name: 'Size', value: entry.fileSize, inline: true });

  const dRes = await fetch(env.DISCORD_UPDATES_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [
        {
          title: `New Eden Lens ${entry.version} — ${entry.title}`,
          url: downloadPageUrl,
          description,
          color: 0x38bdf8,
          fields,
          footer: { text: 'New Eden Lens • Release Update' },
          timestamp: new Date().toISOString()
        }
      ]
    })
  });

  if (!dRes.ok) {
    const text = await dRes.text().catch(() => '');
    return { posted: false, error: `Discord returned ${dRes.status}: ${text.slice(0, 200)}` };
  }
  return { posted: true };
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const authed = await verifyAdminRequest(context.request, context.env);
  if (!authed) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!context.env.LENS_KV) {
    return jsonResponse({ error: 'LENS_KV namespace is not bound in Cloudflare Pages.' }, 503);
  }

  try {
    const body = (await context.request.json()) as {
      version?: string;
      title?: string;
      date?: string;
      downloadUrl?: string;
      r2Key?: string;
      fileSize?: string;
      virusTotalUrl?: string;
      notes?: string;
      postToDiscord?: boolean;
    };

    const version = (body.version ?? '').trim();
    const title = (body.title ?? '').trim();
    const notes = (body.notes ?? '').trim();
    const downloadUrl = (body.downloadUrl ?? '').trim() || '/api/download';

    if (!version || !title || !notes) {
      return jsonResponse({ error: 'Version, title, and patch notes are required.' }, 400);
    }

    const entry: ReleaseEntry = {
      id: `rel-${Date.now()}`,
      version,
      title,
      date: (body.date ?? '').trim() || new Date().toISOString().slice(0, 10),
      downloadUrl,
      r2Key: (body.r2Key ?? '').trim() || undefined,
      fileSize: (body.fileSize ?? '').trim() || undefined,
      virusTotalUrl: (body.virusTotalUrl ?? '').trim() || undefined,
      notes
    };

    const existing = await getStoredReleases(context.env);
    const updated = [entry, ...existing.filter((r) => r.version !== version)];
    await context.env.LENS_KV.put('releases', JSON.stringify(updated));

    let discordPosted = false;
    let discordError: string | undefined;
    if (body.postToDiscord !== false) {
      const res = await postReleaseToDiscord(context.env, context.request.url, entry);
      discordPosted = res.posted;
      discordError = res.error;
    }

    return jsonResponse({ ok: true, release: entry, releases: updated, discordPosted, discordError });
  } catch {
    return jsonResponse({ error: 'Invalid request payload.' }, 400);
  }
};

export const onRequestPut = async (context: { request: Request; env: Env }): Promise<Response> => {
  const authed = await verifyAdminRequest(context.request, context.env);
  if (!authed) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!context.env.LENS_KV) {
    return jsonResponse({ error: 'LENS_KV namespace is not bound in Cloudflare Pages.' }, 503);
  }

  try {
    const body = (await context.request.json()) as {
      id?: string;
      version?: string;
      title?: string;
      date?: string;
      downloadUrl?: string;
      r2Key?: string;
      fileSize?: string;
      virusTotalUrl?: string;
      notes?: string;
      postToDiscord?: boolean;
    };

    if (!body.id) return jsonResponse({ error: 'Missing release id.' }, 400);

    const existing = await getStoredReleases(context.env);
    let updatedEntry: ReleaseEntry | null = null;
    const updated = existing.map((r) => {
      if (r.id !== body.id) return r;
      updatedEntry = {
        ...r,
        version: (body.version ?? r.version).trim(),
        title: (body.title ?? r.title).trim(),
        date: (body.date ?? r.date).trim(),
        downloadUrl: (body.downloadUrl ?? r.downloadUrl).trim() || '/api/download',
        r2Key: body.r2Key !== undefined ? body.r2Key.trim() || undefined : r.r2Key,
        fileSize: body.fileSize !== undefined ? body.fileSize.trim() || undefined : r.fileSize,
        virusTotalUrl:
          body.virusTotalUrl !== undefined ? body.virusTotalUrl.trim() || undefined : r.virusTotalUrl,
        notes: (body.notes ?? r.notes).trim()
      };
      return updatedEntry;
    });

    if (!updatedEntry) return jsonResponse({ error: 'Release not found.' }, 404);
    await context.env.LENS_KV.put('releases', JSON.stringify(updated));

    let discordPosted = false;
    let discordError: string | undefined;
    if (body.postToDiscord) {
      const res = await postReleaseToDiscord(context.env, context.request.url, updatedEntry);
      discordPosted = res.posted;
      discordError = res.error;
    }

    return jsonResponse({
      ok: true,
      release: updatedEntry,
      releases: updated,
      discordPosted,
      discordError
    });
  } catch {
    return jsonResponse({ error: 'Invalid request payload.' }, 400);
  }
};

export const onRequestDelete = async (context: { request: Request; env: Env }): Promise<Response> => {
  const authed = await verifyAdminRequest(context.request, context.env);
  if (!authed) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!context.env.LENS_KV) return jsonResponse({ error: 'LENS_KV not bound.' }, 503);

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'Missing id' }, 400);

  const existing = await getStoredReleases(context.env);
  const next = existing.filter((r) => r.id !== id);
  await context.env.LENS_KV.put('releases', JSON.stringify(next));
  return jsonResponse({ ok: true, releases: next });
};
