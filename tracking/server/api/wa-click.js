import { applyCors, safeAttribution, safeText } from '../lib/security.js';
import { hasExternalKV, saveWhatsAppRef } from '../lib/store.js';
const REFERENCE_PATTERN = /^[A-Z0-9_-]{6,96}$/i;
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!hasExternalKV()) return res.status(503).json({ error: 'Persistent storage is not configured' });
  const body = req.body || {}; const ref = safeText(body.ref || body.reference, 96);
  if (!REFERENCE_PATTERN.test(ref)) return res.status(400).json({ error: 'A valid ref is required' });
  const cart = body.cart && typeof body.cart === 'object' ? body.cart : {};
  try {
    await saveWhatsAppRef(ref, { created_at: new Date(Number(body.ts) || Date.now()).toISOString(), landing_url: safeText(body.page_url || body.landing_url, 2048), fbc: safeText(body.fbc, 512), fbp: safeText(body.fbp, 512), attribution: safeAttribution({ ...(body.attribution || {}), fbclid: body.fbclid, ad_id: body.ad_id }), cart: { value: Number(cart.value || 0), currency: safeText(cart.currency, 12), num_items: Number(cart.num_items || 0), content_ids: Array.isArray(cart.content_ids) ? cart.content_ids.map(String).filter(Boolean).slice(0,100) : [], contents: Array.isArray(cart.contents) ? cart.contents.slice(0,100) : [] }, store: 'sa' }, 'sa');
    return res.status(200).json({ ok: true, ref: ref.toUpperCase(), retention_days: 30 });
  } catch (error) { return res.status(502).json({ error: 'Unable to store WhatsApp click' }); }
}
