import {
  getStoredReleases,
  jsonResponse,
  verifyAdminRequest,
  type Env,
  type ReleaseEntry
} from '../_shared';

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const authed = await verifyAdminRequest(context.request, context.env);
  if (!authed) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!context.env.LENS_KV) {
    return jsonResponse({ error: 'LENS_KV namespace is not bound in Cloudflare Pages.' }, 503);
  }

  try {
    const body = (await context.request.json()) as {
      version?: string;
      title?: string;
      date?: string;
      downloadUrl?: string;
      sha256?: string;
      fileSize?: string;
      virusTotalUrl?: string;
      notes?: string;
      postToDiscord?: boolean;
    };

    const version = (body.version ?? '').trim();
    const title = (body.title ?? '').trim();
    const notes = (body.notes ?? '').trim();
    const downloadUrl = (body.downloadUrl ?? '').trim();

    if (!version || !title || !notes || !downloadUrl) {
      return jsonResponse({ error: 'Version, title, download URL, and patch notes are required.' }, 400);
    }

    const entry: ReleaseEntry = {
      id: `rel-${Date.now()}`,
      version,
      title,
      date: (body.date ?? '').trim() || new Date().toISOString().slice(0, 10),
      downloadUrl,
      sha256: (body.sha256 ?? '').trim() || undefined,
      fileSize: (body.fileSize ?? '').trim() || undefined,
      virusTotalUrl: (body.virusTotalUrl ?? '').trim() || undefined,
      notes
    };

    const existing = await getStoredReleases(context.env);
    const updated = [entry, ...existing.filter((r) => r.version !== version)];
    await context.env.LENS_KV.put('releases', JSON.stringify(updated));

    let discordPosted = false;
    if (body.postToDiscord !== false && context.env.DISCORD_UPDATES_WEBHOOK_URL) {
      const origin = new URL(context.request.url).origin;
      const downloadPageUrl = `${origin}/#download`;
      const fields = [
        { name: 'Download Page', value: `[Download ${version}](${downloadPageUrl})`, inline: true },
        { name: 'Release Date', value: entry.date, inline: true }
      ];
      if (entry.fileSize) fields.push({ name: 'Size', value: entry.fileSize, inline: true });
      if (entry.sha256) fields.push({ name: 'SHA-256', value: `\`${entry.sha256}\``, inline: false });

      const dRes = await fetch(context.env.DISCORD_UPDATES_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: `New Eden Lens ${version} — ${title}`,
              url: downloadPageUrl,
              description: notes.slice(0, 3800),
              color: 0x38bdf8,
              fields,
              footer: { text: 'New Eden Lens • Release Update' },
              timestamp: new Date().toISOString()
            }
          ]
        })
      });
      discordPosted = dRes.ok;
    }

    return jsonResponse({ ok: true, release: entry, releases: updated, discordPosted });
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

