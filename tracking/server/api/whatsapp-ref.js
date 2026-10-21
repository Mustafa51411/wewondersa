import { EVENT_NAMES, resolveStore } from '../lib/tracking-config.js';
import { sendMetaEvent } from '../lib/meta-capi.js';
import { isEventProcessed, markEventProcessed, saveWhatsAppRef } from '../lib/store.js';
import { applyCors, clientIp, safeAttribution, safeClickId, safeText } from '../lib/security.js';
const REFERENCE_PATTERN = /^[A-Z0-9_-]{5,96}$/i;
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { applyCors(req, res); return res.status(204).end(); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  const body = req.body || {}; const reference = safeText(body.reference, 96); const eventId = safeText(body.event_id, 160);
  if (!REFERENCE_PATTERN.test(reference) || !eventId) return res.status(400).json({ error: 'A valid reference and event_id are required' });
  // CHANGE: store from the request (store field, then landing URL). The reference was always saved under 'sa',
  // so Lebanon WhatsApp codes could never be found by the Lebanon order webhook.
  const store = resolveStore({ declared: body.store, url: body.landing_url });
  const fbc = safeClickId(body.fbc); const fbp = safeClickId(body.fbp);
  try {
    const attribution = safeAttribution(body.attribution);
    await saveWhatsAppRef(reference, { created_at: new Date().toISOString(), fbc, fbp, landing_url: safeText(body.landing_url, 2048), client_ip_address: clientIp(req), client_user_agent: safeText(req.headers['user-agent'], 512), attribution, store }, store);
    if (isEventProcessed(eventId)) return res.status(200).json({ ok: true, deduplicated: true });
    const result = await sendMetaEvent({ eventName: EVENT_NAMES.WHATSAPP, eventId, eventSourceUrl: safeText(body.landing_url, 2048),
      clientIp: clientIp(req), clientUserAgent: safeText(req.headers['user-agent'], 512), fbc, fbp,
      customer: body.customer || {}, customData: { ...attribution, store, whatsapp_reference: reference } });
    if (!result.success) return res.status(503).json({ ok: false, error: 'Meta rejected or could not receive the event' });
    console.log(`[whatsapp-ref] ok ref=${reference.toUpperCase()} store=${store} trace=${result.fbtrace_id}`);
    markEventProcessed(eventId); return res.status(200).json({ ok: true, reference, store });
  } catch (error) { console.error('WhatsApp reference event failed:', error.message); return res.status(502).json({ error: 'Unable to record WhatsApp reference' }); }
}

