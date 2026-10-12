import { saveWhatsAppRef, getWhatsAppRef } from '../lib/store.js';
import { sendMetaEvent } from '../lib/meta-capi.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // GET: Retrieve attribution for a reference code
  if (req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const code = url.searchParams.get('code');
    if (!code) {
      return res.status(400).json({ error: 'code query parameter required' });
    }
    const attribution = await getWhatsAppRef(code);
    if (!attribution) {
      return res.status(404).json({ error: 'Reference code not found' });
    }
    return res.status(200).json({ success: true, attribution });
  }

  // POST: Save attribution & fire WW_WhatsApp CAPI event
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const {
        ref_code,
        store = 'sa',
        fbc,
        fbp,
        utms = {},
        landing_page,
        value,
        currency,
        event_id
      } = body;

      if (!ref_code) {
        return res.status(400).json({ error: 'ref_code is required' });
      }

      const clientIp = (
        req.headers['cf-connecting-ip'] ||
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        null
      );
      const clientUserAgent = req.headers['user-agent'] || null;

      // 1. Save attribution in KV / store
      const entry = await saveWhatsAppRef(ref_code, {
        store,
        fbc,
        fbp,
        utms,
        landing_page,
        clientIp,
        clientUserAgent,
        value,
        currency
      });

      // 2. Fire WW_WhatsApp event to Meta CAPI
      const waEventId = event_id || `wa_${ref_code}_${Date.now()}`;
      const capiResult = await sendMetaEvent({
        eventName: 'WW_WhatsApp',
        eventId: waEventId,
        eventSourceUrl: landing_page,
        actionSource: 'website',
        clientIp,
        clientUserAgent,
        fbc,
        fbp,
        customData: {
          value,
          currency: currency || (store === 'sa' ? 'SAR' : 'USD'),
          store,
          order_id: ref_code
        }
      });

      return res.status(200).json({
        success: true,
        ref_code,
        event_id: waEventId,
        stored: entry,
        capi: capiResult
      });
    } catch (err) {
      console.error('[API /whatsapp-ref] Error:', err);
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
