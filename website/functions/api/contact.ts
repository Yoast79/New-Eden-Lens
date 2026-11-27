import { jsonResponse, type Env } from './_shared';

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  try {
    const body = (await context.request.json()) as {
      name?: string;
      contact?: string;
      subject?: string;
      message?: string;
      website?: string; // honeypot
    };

    if (body.website && body.website.trim().length > 0) {
      return jsonResponse({ ok: true });
    }

    const name = (body.name ?? '').trim().slice(0, 80);
    const contact = (body.contact ?? '').trim().slice(0, 120);
    const subject = (body.subject ?? 'General Inquiry').trim().slice(0, 120);
    const message = (body.message ?? '').trim().slice(0, 2000);

    if (!name || !message) {
      return jsonResponse({ error: 'Name and message are required.' }, 400);
    }

    const webhook = context.env.DISCORD_CONTACT_WEBHOOK_URL;
    if (!webhook) {
      return jsonResponse({ error: 'Contact webhook is not configured on the server.' }, 503);
    }

    const discordRes = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `New Contact Message: ${subject}`,
            color: 0x38bdf8,
            fields: [
              { name: 'Pilot / Name', value: name, inline: true },
              { name: 'Discord / Email', value: contact || 'Not provided', inline: true },
              { name: 'Message', value: message, inline: false }
            ],
            footer: { text: 'New Eden Lens Website Contact Form' },
            timestamp: new Date().toISOString()
          }
        ]
      })
    });

    if (!discordRes.ok) {
      return jsonResponse({ error: 'Failed to deliver message.' }, 502);
    }

    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: 'Invalid request payload.' }, 400);
  }
};

