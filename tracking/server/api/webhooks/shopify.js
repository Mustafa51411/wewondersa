import crypto from 'node:crypto';
import { sendMetaEvent } from '../../lib/meta-capi.js';
import { isOrderProcessed, markOrderProcessed, getWhatsAppRef } from '../../lib/store.js';

export const config = { api: { bodyParser: false } };

async function rawRequestBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Verify Shopify Webhook HMAC SHA256 signature
 */
function verifyShopifyHmac(rawBody, hmacHeader) {
  if (!hmacHeader) return false;
  const secrets = [
    process.env.SHOPIFY_WEBHOOK_SECRET,
    process.env.SHOPIFY_WEBHOOK_SECRET_SA,
    process.env.SHOPIFY_WEBHOOK_SECRET_LB
  ].filter(Boolean);

  if (secrets.length === 0) return false;

  for (const secret of secrets) {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    if (crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader))) {
      return true;
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const rawBody = await rawRequestBody(req);
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    const topic = req.headers['x-shopify-topic'] || 'orders/paid';
    const shopDomain = req.headers['x-shopify-shop-domain'] || '';

    // Determine store tag from shop domain or currency
    let store = 'sa';
    if (shopDomain.includes('weewonderslb') || shopDomain.includes('lebanon')) {
      store = 'lb';
    }

    // Verify HMAC if secrets are set
    if (!verifyShopifyHmac(rawBody, hmacHeader)) {
      console.error('[Shopify Webhook] Invalid HMAC signature');
      return res.status(401).json({ error: 'Invalid HMAC signature' });
    }

    const order = JSON.parse(rawBody || '{}');
    if (!order.id) {
      return res.status(400).json({ error: 'Invalid order payload' });
    }

    // Derive store from currency if not already detected
    if (order.currency === 'USD') store = 'lb';
    if (order.currency === 'SAR') store = 'sa';

    const orderEventId = `order_${order.id}`;

    // Deduplication check
    if (isOrderProcessed(order.id)) {
      console.log(`[Shopify Webhook] Order ${order.id} already processed. Skipping.`);
      return res.status(200).json({ success: true, message: 'Order already processed', order_id: order.id });
    }

    // Extract customer contact data
    const email = order.email || order.customer?.email || order.contact_email;
    const phone = (
      order.phone ||
      order.customer?.phone ||
      order.shipping_address?.phone ||
      order.billing_address?.phone
    );
    const country = (
      order.shipping_address?.country_code ||
      order.billing_address?.country_code ||
      (store === 'sa' ? 'SA' : 'LB')
    );

    // Extract note_attributes
    const noteAttributes = {};
    if (Array.isArray(order.note_attributes)) {
      order.note_attributes.forEach(attr => {
        if (attr && attr.name) noteAttributes[attr.name] = attr.value;
      });
    }

    let fbc = noteAttributes['_fbc'] || null;
    let fbp = noteAttributes['_fbp'] || null;
    let refCode = noteAttributes['wa_ref'] || noteAttributes['ref_code'] || null;

    // If no ref_code in attributes, check order.note for pattern (e.g. "Ref: W8K2" or "W8K2")
    if (!refCode && order.note) {
      const match = String(order.note).match(/\b(?:ref|code|رمز|طلب)?[:\s-]*([A-Za-z0-9]{4,8})\b/i);
      if (match) {
        refCode = match[1].toUpperCase();
      }
    }

    let actionSource = 'website';
    let eventSourceUrl = order.order_status_url || null;

    // If WhatsApp reference code exists, look up saved attribution
    if (refCode) {
      const savedRef = await getWhatsAppRef(refCode);
      if (savedRef) {
        console.log(`[Shopify Webhook] Found WhatsApp attribution for ref ${refCode}:`, savedRef);
        if (!fbc && savedRef.fbc) fbc = savedRef.fbc;
        if (!fbp && savedRef.fbp) fbp = savedRef.fbp;
        if (!eventSourceUrl && savedRef.landing_url) eventSourceUrl = savedRef.landing_url;
        actionSource = 'other'; // Recommended for orders placed via chat / WhatsApp
      }
    }

    // Order timestamp in seconds
    const orderDate = order.created_at || order.processed_at || new Date().toISOString();
    const eventTime = Math.floor(new Date(orderDate).getTime() / 1000);

    const clientIp = order.browser_ip || order.client_details?.browser_ip || null;
    const clientUserAgent = order.client_details?.user_agent || null;

    // Send WW_Order to Meta Conversions API
    const capiResult = await sendMetaEvent({
      eventName: 'WW_Order',
      eventId: orderEventId,
      eventTime,
      eventSourceUrl,
      actionSource,
      clientIp,
      clientUserAgent,
      fbc,
      fbp,
      customer: { email, phone, country, first_name: order.customer?.first_name || order.shipping_address?.first_name,
        last_name: order.customer?.last_name || order.shipping_address?.last_name, city: order.shipping_address?.city,
        zip: order.shipping_address?.zip, external_id: order.customer?.id },
      customData: {
        value: Number(order.total_price) || 0,
        currency: order.currency || (store === 'sa' ? 'SAR' : 'USD'),
        num_items: Array.isArray(order.line_items) ? order.line_items.reduce((total, item) => total + Number(item.quantity || 0), 0) : 1,
        content_ids: Array.isArray(order.line_items) ? order.line_items.map((item) => String(item.product_id || item.variant_id || '')).filter(Boolean) : [],
        content_type: 'product',
        contents: Array.isArray(order.line_items) ? order.line_items.map((item) => ({ id: String(item.product_id || item.variant_id || ''), quantity: Number(item.quantity || 1), item_price: Number(item.price || 0) })).filter((item) => item.id) : [],
        order_id: String(order.id),
        store
      }
    });

    if (capiResult.success) markOrderProcessed(order.id);

    console.log(`[Shopify Webhook] Emitted WW_Order for order ${order.id}:`, capiResult);

    return res.status(200).json({
      success: true,
      order_id: order.id,
      event_id: orderEventId,
      action_source: actionSource,
      capi: capiResult
    });
  } catch (err) {
    console.error('[Shopify Webhook] Error processing webhook:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
}
