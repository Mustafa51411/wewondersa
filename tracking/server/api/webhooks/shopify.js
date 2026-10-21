import crypto from 'node:crypto';
import { sendMetaEvent } from '../../lib/meta-capi.js';
import { getCheckoutAttribution, getWhatsAppRef, isOrderProcessed, markOrderProcessed, releaseOrder, reserveOrder } from '../../lib/store.js';

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
 * CHANGE: lengths are compared first. timingSafeEqual throws when they differ, which returned 500 instead of 401.
 */
function verifyShopifyHmac(rawBody, hmacHeader) {
  if (!hmacHeader) return false;
  const secrets = [
    process.env.SHOPIFY_WEBHOOK_SECRET,
    process.env.SHOPIFY_WEBHOOK_SECRET_SA,
    process.env.SHOPIFY_WEBHOOK_SECRET_LB
  ].filter(Boolean);

  if (secrets.length === 0) return false;

  const given = Buffer.from(String(hmacHeader));
  for (const secret of secrets) {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    const expected = Buffer.from(hash);
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) {
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
    const topic = req.headers['x-shopify-topic'] || 'orders/create';
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
    if (isOrderProcessed(order.id) || !(await reserveOrder(order.id, store))) {
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

    // Tags (WhatsApp code and test mode both live in tags)
    const tagList = (Array.isArray(order.tags) ? order.tags : String(order.tags || '').split(','))
      .map((tag) => String(tag).trim()).filter(Boolean);

    let fbc = noteAttributes['_fbc'] || null;
    let fbp = noteAttributes['_fbp'] || null;
    if (!order.checkout_token) console.log(`[Shopify Webhook] Order ${order.id} has no checkout_token on this payload (topic ${topic}).`);
    const checkoutAttribution = await getCheckoutAttribution(order.checkout_token, store);
    if (checkoutAttribution) {
      fbc = fbc || checkoutAttribution.fbc || null;
      fbp = fbp || checkoutAttribution.fbp || null;
    }
    let refCode = noteAttributes['wa_ref'] || noteAttributes['ref_code'] || null;

    if (!refCode) {
      const waTag = tagList.find((tag) => /^wa_[a-z0-9]+$/i.test(tag));
      if (waTag) refCode = waTag.slice(3).toUpperCase();
    }

    // CHANGE: the note is only read when it clearly says "ref" / "code" before the value.
    // Before, any 4 to 8 letter word in the note (for example "please") was taken as a code.
    if (!refCode && order.note) {
      const match = String(order.note).match(/\b(?:ref|code|Ø±Ù…Ø²)\s*[:#-]?\s*([A-Za-z0-9]{4,8})\b/i);
      if (match) {
        refCode = match[1].toUpperCase();
      }
    }

    // TEST MODE: tag the order wa_TEST1 and its WW_Order goes to Events Manager > Test events.
    // Needs the WW_TEST_EVENT_CODE environment variable (copy the code from Test events). Not used for live orders.
    const isTest = tagList.some((tag) => tag.toLowerCase() === 'wa_test1');
    const testEventCode = isTest ? (process.env.WW_TEST_EVENT_CODE || '') : '';

    let actionSource = 'website';
    let savedClick = null;
    let eventSourceUrl = order.order_status_url || null;

    // If WhatsApp reference code exists, look up saved attribution
    if (refCode) {
      const savedRef = await getWhatsAppRef(refCode, store);
      if (savedRef) {
        savedClick = savedRef;
        console.log(`[Shopify Webhook] Found WhatsApp attribution for ref ${refCode}`);
        if (!fbc && savedRef.fbc) fbc = savedRef.fbc;
        if (!fbp && savedRef.fbp) fbp = savedRef.fbp;
        if (!eventSourceUrl && savedRef.landing_url) eventSourceUrl = savedRef.landing_url;
        // Preserve a website event with the stored browser data for matching.
      }
    }

    // Order timestamp in seconds
    const orderDate = order.created_at || order.processed_at || new Date().toISOString();
    const eventTime = Math.floor(new Date(orderDate).getTime() / 1000);

    // CHANGE: Shopify's landing_site is usually a relative path ("/?fbclid=..."), and new URL() threw on it,
    // so this fallback never ran. A base address is now supplied.
    if (!fbc) {
      const landingUrl = order.landing_site || '';
      try {
        const fbclid = new URL(landingUrl, 'https://placeholder.invalid').searchParams.get('fbclid');
        if (fbclid) fbc = `fb.1.${new Date(order.created_at || Date.now()).getTime()}.${fbclid}`;
      } catch (_) {}
    }
    const clientIp = order.browser_ip || order.client_details?.browser_ip || savedClick?.client_ip_address || checkoutAttribution?.client_ip_address || null;
    const clientUserAgent = order.client_details?.user_agent || savedClick?.client_user_agent || checkoutAttribution?.client_user_agent || null;

    // CHANGE: use the same external id the pixel sends (saved at checkout), so the two events match each other.
    const externalId = checkoutAttribution?.external_id || order.customer?.id;

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
      testEventCode,
      customer: { email, phone, country, first_name: order.customer?.first_name || order.shipping_address?.first_name,
        last_name: order.customer?.last_name || order.shipping_address?.last_name, city: order.shipping_address?.city,
        zip: order.shipping_address?.zip, external_id: externalId },
      customData: {
        value: Number(order.total_price_set?.presentment_money?.amount || order.total_price) || 0,
        currency: order.total_price_set?.presentment_money?.currency_code || order.currency || (store === 'sa' ? 'SAR' : 'USD'),
        num_items: Array.isArray(order.line_items) ? order.line_items.reduce((total, item) => total + Number(item.quantity || 0), 0) : 1,
        content_ids: Array.isArray(order.line_items) ? order.line_items.map((item) => String(item.product_id || item.variant_id || '')).filter(Boolean) : [],
        content_type: 'product',
        contents: Array.isArray(order.line_items) ? order.line_items.map((item) => { const quantity = Number(item.quantity || 1); const lineTotal = Number(item.price || 0) * quantity - Number(item.total_discount || 0); return { id: String(item.product_id || item.variant_id || ''), quantity, item_price: lineTotal / quantity }; }).filter((item) => item.id) : [],
        order_id: String(order.id),
        store,
        ref: refCode || undefined,
        whatsapp_reference: refCode || undefined
      }
    });

    if (capiResult.success) markOrderProcessed(order.id);
    else await releaseOrder(order.id, store);

    // One searchable line per order: what was sent, with click data and ad tags (Vercel > Logs, search "[ORDER]").
    console.log('[ORDER]', JSON.stringify({
      store, topic, order_id: String(order.id), total: order.total_price_set?.presentment_money?.amount || order.total_price,
      currency: order.total_price_set?.presentment_money?.currency_code || order.currency,
      fbc: !!fbc, fbp: !!fbp, external_id: !!externalId, checkout_token: order.checkout_token ? String(order.checkout_token).slice(0, 6) : null, checkout_record_found: !!checkoutAttribution, wa_ref: refCode || null, test: isTest,
      attribution: checkoutAttribution?.attribution || savedClick?.attribution || {},
      meta: capiResult.success ? { received: capiResult.events_received, trace: capiResult.fbtrace_id } : { error: capiResult.error }
    }));

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

