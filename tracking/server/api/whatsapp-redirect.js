import { EVENT_NAMES, STORE } from '../lib/tracking-config.js';
import { sendMetaEvent } from '../lib/meta-capi.js';
import { hasExternalKV, saveWhatsAppRef } from '../lib/store.js';
import { clientIp, safeText } from '../lib/security.js';

const PHONE_PATTERN = /^\d{8,20}$/;
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function createReference() {
  let reference = 'W';
  for (let index = 0; index < 6; index += 1) {
    reference += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return reference;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const targetNumber = String(req.query?.to || '').replace(/\D/g, '');
  if (!PHONE_PATTERN.test(targetNumber)) return res.status(400).json({ error: 'A valid WhatsApp number is required' });

  const reference = createReference();
  const eventId = `wa_${reference}_${Date.now()}`;
  const eventSourceUrl = safeText(req.headers.referer, 2048);
  const userAgent = safeText(req.headers['user-agent'], 512);

  try {
    if (hasExternalKV()) {
      await saveWhatsAppRef(reference, {
        created_at: new Date().toISOString(),
        landing_url: eventSourceUrl,
        client_ip_address: clientIp(req),
        client_user_agent: userAgent,
        attribution: {},
        cart: { value: 0, currency: 'SAR', num_items: 0, content_ids: [], contents: [] },
        store: STORE
      }, STORE);
    }

    // This is the server-side counterpart of the WhatsApp button click.
    // It purposely contains only the generated reference and technical match data.
    await sendMetaEvent({
      eventName: EVENT_NAMES.WHATSAPP,
      eventId,
      eventSourceUrl,
      clientIp: clientIp(req),
      clientUserAgent: userAgent,
      customData: { store: STORE, whatsapp_reference: reference, ref: reference }
    });
  } catch (error) {
    // A tracking outage must never prevent the customer from opening WhatsApp.
    console.error('WhatsApp redirect tracking failed:', error.message);
  }

  const text = `مرحباً، أريد المساعدة بخصوص WeeWonders [المرجع: ${reference}]`;
  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(302, { Location: `https://wa.me/${targetNumber}?text=${encodeURIComponent(text)}` });
  return res.end();
}
