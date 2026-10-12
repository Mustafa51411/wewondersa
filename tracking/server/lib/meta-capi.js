import crypto from 'node:crypto';

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
 * Format & hash phone: only digits including country code, no + or spaces
 */
export function hashPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits ? sha256(digits) : null;
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
 * - Sends only: value, currency, order_id, num_items, store
 * - Sends NO product names, categories, page titles, or free text
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
  email,
  phone,
  country,
  customData = {}
}) {
  const pixelId = process.env.META_PIXEL_ID || '1032874294681740';
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const testCode = process.env.TEST_EVENT_CODE;

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

  const em = hashEmail(email);
  if (em) userData.em = [em];

  const ph = hashPhone(phone);
  if (ph) userData.ph = [ph];

  const co = hashCountry(country);
  if (co) userData.country = [co];

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

  const endpoint = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`;

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
