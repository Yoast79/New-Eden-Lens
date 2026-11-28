import { jsonResponse, type Env } from './_shared';

const MASK = [0x4e, 0x65, 0x77, 0x45, 0x64, 0x65, 0x6e, 0x4c, 0x65, 0x6e, 0x73, 0x21];
const BUG_ENC = [38, 17, 3, 53, 23, 95, 65, 99, 1, 7, 0, 66, 33, 23, 19, 107, 7, 10, 3, 99, 4, 30, 26, 14, 57, 0, 21, 45, 11, 10, 5, 63, 74, 95, 70, 22, 120, 85, 70, 125, 82, 93, 92, 125, 93, 90, 75, 23, 122, 85, 65, 117, 75, 50, 67, 61, 87, 24, 74, 64, 56, 87, 90, 11, 9, 51, 90, 24, 81, 1, 61, 98, 13, 29, 62, 8, 8, 2, 59, 11, 28, 40, 29, 85, 9, 50, 66, 54, 2, 63, 86, 37, 14, 30, 70, 69, 22, 35, 4, 61, 92, 1, 56, 120, 8, 26, 0, 79, 2, 92, 47, 35, 92, 31, 41, 61, 21, 11, 20, 12, 127];
const FEAT_ENC = [38, 17, 3, 53, 23, 95, 65, 99, 1, 7, 0, 66, 33, 23, 19, 107, 7, 10, 3, 99, 4, 30, 26, 14, 57, 0, 21, 45, 11, 10, 5, 63, 74, 95, 70, 22, 120, 85, 70, 125, 92, 81, 87, 116, 93, 87, 68, 25, 125, 93, 69, 125, 75, 60, 86, 11, 9, 58, 34, 64, 43, 93, 26, 50, 38, 1, 57, 124, 10, 62, 58, 101, 45, 1, 34, 104, 40, 10, 42, 116, 49, 34, 22, 77, 31, 86, 5, 115, 55, 28, 93, 20, 84, 33, 62, 17, 22, 7, 69, 125, 13, 40, 31, 61, 49, 3, 32, 114, 45, 63, 36, 60, 51, 44, 1, 43, 21, 12, 20, 105, 61];

function decodeWebhook(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes.map((b, i) => b ^ MASK[i % MASK.length])));
}

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

    const clean = (s: string | undefined, max: number) =>
      (s ?? '').replace(/@(everyone|here)/gi, '@\u200b$1').trim().slice(0, max);

    const name = clean(body.name, 80);
    const contact = clean(body.contact, 120);
    const subject = clean(body.subject, 120) || 'General Feedback';
    const message = clean(body.message, 2000);

    if (!name || !message) {
      return jsonResponse({ error: 'Name and message are required.' }, 400);
    }

    const lowerSubject = subject.toLowerCase();
    const isBug = lowerSubject.includes('bug');
    const isFeature = lowerSubject.includes('feature');

    const webhook = isBug
      ? context.env.DISCORD_BUG_WEBHOOK_URL || decodeWebhook(BUG_ENC)
      : isFeature
        ? context.env.DISCORD_FEATURE_WEBHOOK_URL || decodeWebhook(FEAT_ENC)
        : context.env.DISCORD_CONTACT_WEBHOOK_URL;

    if (!webhook) {
      return jsonResponse({ error: 'Contact webhook is not configured on the server.' }, 503);
    }

    const embedColor = isBug ? 0xf43f5e : isFeature ? 0x38bdf8 : 0x6366f1;

    const discordRes = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `${isBug ? '🐛 Bug Report' : isFeature ? '💡 Feature Request' : '💬 General Feedback'}: ${subject}`,
            color: embedColor,
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

