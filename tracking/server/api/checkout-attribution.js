// NEW. The pixel posts here at checkout start and again when the order completes.
// It only STORES click data (fbc, fbp, ad tags, external id, IP, user agent) for 7 days, keyed by checkout token.
// The order webhook reads it back, so WW_Order carries Click ID and Browser ID. Nothing is sent to Meta from here.
import { applyCors, clientIp, safeAttribution, safeClickId, safeText } from '../lib/security.js';
import { getCheckoutAttribution, hasExternalKV, saveCheckoutAttribution } from '../lib/store.js';
import { resolveStore } from '../lib/tracking-config.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!hasExternalKV()) return res.status(503).json({ error: 'Persistent storage is not configured' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const token = safeText(String(body.checkout_token || ''), 256);
  if (!/^[A-Za-z0-9_=.~-]{8,256}$/.test(token)) return res.status(400).json({ error: 'A valid checkout_token is required' });
  const store = resolveStore({ declared: body.store });
  try {
    // Merge with what is already stored, so the second call never erases good data with empty values.
    const prev = (await getCheckoutAttribution(token, store)) || {};
    const record = {
      fbc: safeClickId(body.fbc) || prev.fbc || '',
      fbp: safeClickId(body.fbp) || prev.fbp || '',
      external_id: safeText(String(body.external_id || ''), 128) || prev.external_id || '',
      order_id: safeText(String(body.order_id || ''), 64) || prev.order_id || '',
      attribution: { ...(prev.attribution || {}), ...safeAttribution(body.attribution || {}) },
      client_ip_address: clientIp(req) || prev.client_ip_address || '',
      client_user_agent: safeText(req.headers['user-agent'], 512) || prev.client_user_agent || '',
      store
    };
    await saveCheckoutAttribution(token, record, store);
    console.log(`[checkout-attribution] saved store=${store} token=${token.slice(0, 6)}... fbc=${record.fbc ? 'y' : 'n'} fbp=${record.fbp ? 'y' : 'n'} order=${record.order_id || '-'}`);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[checkout-attribution] failed:', error.message);
    return res.status(502).json({ error: 'Unable to store checkout data' });
  }
}

