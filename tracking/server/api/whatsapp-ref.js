import { EVENT_NAMES, STORE } from '../lib/tracking-config.js';
import { sendMetaEvent } from '../lib/meta-capi.js';
import { isEventProcessed, markEventProcessed, saveWhatsAppRef } from '../lib/store.js';
import { applyCors, clientIp, safeAttribution, safeText } from '../lib/security.js';
const REFERENCE_PATTERN = /^[A-Z0-9_-]{5,96}$/i;
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { applyCors(req, res); return res.status(204).end(); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  const body = req.body || {}; const reference = safeText(body.reference, 96); const eventId = safeText(body.event_id, 160);
  if (!REFERENCE_PATTERN.test(reference) || !eventId) return res.status(400).json({ error: 'A valid reference and event_id are required' });
  try {
    const attribution = safeAttribution(body.attribution);
    await saveWhatsAppRef(reference, { created_at: new Date().toISOString(), fbc: safeText(body.fbc, 512), fbp: safeText(body.fbp, 512), landing_url: safeText(body.landing_url, 2048), attribution });
    if (isEventProcessed(eventId)) return res.status(200).json({ ok: true, deduplicated: true });
    const result = await sendMetaEvent({ eventName: EVENT_NAMES.WHATSAPP, eventId, eventSourceUrl: safeText(body.landing_url, 2048),
      clientIp: clientIp(req), clientUserAgent: safeText(req.headers['user-agent'], 512), fbc: safeText(body.fbc, 512), fbp: safeText(body.fbp, 512),
      customer: body.customer || {}, customData: { ...attribution, store: STORE, whatsapp_reference: reference } });
    if (!result.success) return res.status(503).json({ ok: false, configuration: result.reason });
    markEventProcessed(eventId); return res.status(200).json({ ok: true, reference });
  } catch (error) { console.error('WhatsApp reference event failed:', error.message); return res.status(502).json({ error: 'Unable to record WhatsApp reference' }); }
}
