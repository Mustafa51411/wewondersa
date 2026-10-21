import { applyCors, clientIp, safeAttribution, safeClickId, safeText } from '../lib/security.js';
import { hasExternalKV, saveCheckoutAttribution } from '../lib/store.js';

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!hasExternalKV()) return res.status(503).json({ error: 'Persistent storage is not configured' });
  const body = req.body || {};
  const checkoutToken = safeText(body.checkout_token, 256);
  if (!checkoutToken) return res.status(400).json({ error: 'checkout_token is required' });
  try {
    await saveCheckoutAttribution(checkoutToken, {
      order_id: safeText(body.order_id, 128), fbc: safeClickId(body.fbc), fbp: safeClickId(body.fbp),
      external_id: safeText(body.external_id, 128), attribution: safeAttribution(body.attribution),
      client_ip_address: clientIp(req), client_user_agent: safeText(req.headers['user-agent'], 512)
    }, safeText(body.store, 8) || 'sa');
    return res.status(200).json({ ok: true, retention_days: 7 });
  } catch (error) {
    console.error('Checkout attribution storage failed:', error.message);
    return res.status(502).json({ error: 'Unable to store checkout attribution' });
  }
}
