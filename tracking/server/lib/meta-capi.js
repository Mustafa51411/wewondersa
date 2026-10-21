import crypto from 'node:crypto';

// Bump this when Meta retires the version. Can also be set with the META_GRAPH_VERSION environment variable.
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const CALLING_CODES = { SA: '966', LB: '961', AE: '971' };

/**
 * Hash string using SHA-256
 */
export function sha256(val) {
  if (!val) return null;
  return crypto.createHash('sha256').update(String(val).trim()).digest('hex');
}

/**
 * Format & hash email: lowercase and trimmed
 */
export function hashEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const cleaned = email.trim().toLowerCase();
  return cleaned ? sha256(cleaned) : null;
}

/**
 * CHANGE: phone numbers now always include the country code before hashing.
 *  +966501234567, 00966501234567, 966501234567 -> 966501234567
 *  0501234567 (leading 0)                       -> 966501234567
 *  501234567 (short local number)               -> 966501234567
 *  A long number with no + that starts with another country code is left as it is.
 */
export function normalizePhone(phone, callingCode) {
  if (!phone) return null;
  const raw = String(phone).trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.replace(/^00/, '') || null;
  if (!callingCode) return digits.replace(/^0+/, '') || null;
  if (digits.startsWith('0')) return callingCode + digits.replace(/^0+/, '');
  if (digits.startsWith(callingCode) && digits.length > callingCode.length + 6) return digits;
  if (digits.length <= 9) return callingCode + digits;
  return digits;
}
export function hashPhone(phone, callingCode) {
  const n = normalizePhone(phone, callingCode);
  return n ? sha256(n) : null;
}

/**
 * Format & hash country: 2-letter ISO lowercase
 */
export function hashCountry(country) {
  if (!country || typeof country !== 'string') return null;
  const cleaned = country.trim().toLowerCase().slice(0, 2);
  return cleaned ? sha256(cleaned) : null;
}

/**
 * Send event payload to Meta Conversions API (CAPI)
 * Strictly follows SOW data rules:
 * - Sends only: value, currency, order_id, num_items, store, content ids/contents, ref
 * - Sends NO product names, categories, page titles, or free text
 *
 * CHANGE: a test event code is used ONLY when passed in. The old fallback to the META_TEST_EVENT_CODE /
 * TEST_EVENT_CODE environment variables is removed, so a forgotten variable can never turn live events into test events.
 */
export async function sendMetaEvent({
  eventName,
  eventId,
  eventTime = Math.floor(Date.now() / 1000),
  eventSourceUrl,
  actionSource = 'website',
  clientIp,
  clientUserAgent,
  fbc,
  fbp,
  customer = {},
  customData = {},
  testEventCode
}) {
  const pixelId = process.env.META_PIXEL_ID || '1032874294681740';
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const testCode = testEventCode || '';

  if (!token) {
    console.warn('[Meta CAPI] Warning: META_CAPI_ACCESS_TOKEN not set in environment.');
    return { success: false, error: 'META_CAPI_ACCESS_TOKEN is missing' };
  }

  // 1. Build user_data with proper hashing
  const userData = {};
  if (clientIp) userData.client_ip_address = clientIp;
  if (clientUserAgent) userData.client_user_agent = clientUserAgent;
  if (fbc) userData.fbc = fbc;
  if (fbp) userData.fbp = fbp;

  const em = hashEmail(customer.email);
  if (em) userData.em = [em];

  const callingCode = CALLING_CODES[String(customer.country || '').toUpperCase().slice(0, 2)];
  const ph = hashPhone(customer.phone, callingCode);
  if (ph) userData.ph = [ph];

  const co = hashCountry(customer.country);
  if (co) userData.country = [co];

  const fn = customer.first_name ? sha256(String(customer.first_name).trim().toLowerCase()) : null;
  if (fn) userData.fn = [fn];
  const ln = customer.last_name ? sha256(String(customer.last_name).trim().toLowerCase()) : null;
  if (ln) userData.ln = [ln];
  const ct = customer.city ? sha256(String(customer.city).trim().toLowerCase().replace(/\s+/g, '')) : null;
  if (ct) userData.ct = [ct];
  const zp = customer.zip ? sha256(String(customer.zip).trim().toLowerCase().replace(/\s+/g, '')) : null;
  if (zp) userData.zp = [zp];
  const externalId = customer.external_id ? sha256(String(customer.external_id).trim().toLowerCase()) : null;
  if (externalId) userData.external_id = [externalId];

  // 2. Build sanitized custom_data according to SOW rules
  const sanitizedCustomData = {};
  if (customData.value !== undefined && customData.value !== null && !isNaN(Number(customData.value))) {
    sanitizedCustomData.value = Number(customData.value);
  }
  if (customData.currency) {
    sanitizedCustomData.currency = String(customData.currency).toUpperCase();
  }
  if (customData.order_id) {
    sanitizedCustomData.order_id = String(customData.order_id);
  }
  if (customData.num_items !== undefined && customData.num_items !== null && !isNaN(Number(customData.num_items))) {
    sanitizedCustomData.num_items = Number(customData.num_items);
  }
  if (customData.store) {
    sanitizedCustomData.store = String(customData.store).toLowerCase();
  }
  if (Array.isArray(customData.content_ids)) {
    const ids = customData.content_ids.map(String).filter(Boolean);
    if (ids.length) sanitizedCustomData.content_ids = ids;
  }
  if (customData.content_type) sanitizedCustomData.content_type = String(customData.content_type);
  if (Array.isArray(customData.contents)) {
    const contents = customData.contents.map((item) => ({ id: String(item?.id || ''), quantity: Number(item?.quantity || 1), item_price: Number(item?.item_price || 0) })).filter((item) => item.id);
    if (contents.length) sanitizedCustomData.contents = contents;
  }
  if (customData.ref) sanitizedCustomData.ref = String(customData.ref);
  if (customData.whatsapp_reference) sanitizedCustomData.whatsapp_reference = String(customData.whatsapp_reference);

  // 3. Assemble event item
  const eventItem = {
    event_name: eventName,
    event_time: Number(eventTime) || Math.floor(Date.now() / 1000),
    event_id: String(eventId),
    action_source: actionSource,
    user_data: userData
  };

  if (eventSourceUrl) {
    eventItem.event_source_url = String(eventSourceUrl);
  }

  if (Object.keys(sanitizedCustomData).length > 0) {
    eventItem.custom_data = sanitizedCustomData;
  }

  const payload = {
    data: [eventItem]
  };

  if (testCode) {
    payload.test_event_code = testCode;
  }

  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${token}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) {
      console.error('[Meta CAPI] API error:', res.status, result);
      return { success: false, status: res.status, error: result };
    }

    return {
      success: true,
      events_received: result.events_received,
      fbtrace_id: result.fbtrace_id,
      event_id: eventId
    };
  } catch (err) {
    console.error('[Meta CAPI] Network error:', err.message);
    return { success: false, error: err.message };
  }
}

