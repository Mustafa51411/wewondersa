import { sendMetaEvent } from '../lib/meta-capi.js';
import { isEventProcessed, markEventProcessed } from '../lib/store.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      event_name,
      event_id,
      event_time,
      store = 'sa',
      value,
      currency,
      num_items,
      order_id,
      fbc,
      fbp,
      event_source_url,
      user_data = {}
    } = body;

    if (!event_name || !event_id) {
      return res.status(400).json({ error: 'event_name and event_id are required' });
    }

    // Ignore duplicate event_id to prevent double-counting
    if (isEventProcessed(event_id)) {
      return res.status(200).json({ success: true, message: 'Event already processed', event_id });
    }

    // Extract client IP & User Agent
    const clientIp = (
      req.headers['cf-connecting-ip'] ||
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      null
    );

    const clientUserAgent = req.headers['user-agent'] || null;

    // Send to Meta CAPI
    const capiResult = await sendMetaEvent({
      eventName: event_name,
      eventId: event_id,
      eventTime: event_time,
      eventSourceUrl: event_source_url,
      actionSource: 'website',
      clientIp,
      clientUserAgent,
      fbc: fbc || user_data.fbc,
      fbp: fbp || user_data.fbp,
      email: user_data.email || user_data.em,
      phone: user_data.phone || user_data.ph,
      country: user_data.country,
      customData: {
        value,
        currency: currency || (store === 'sa' ? 'SAR' : 'USD'),
        num_items,
        order_id,
        store
      }
    });

    markEventProcessed(event_id);

    return res.status(200).json({
      success: true,
      event_id,
      event_name,
      store,
      capi: capiResult
    });
  } catch (err) {
    console.error('[API /events] Error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}
