// Store profiles. The store now comes from each request (the pixel sends it) instead of one hardcoded value.
export const DEFAULT_STORE = 'sa';
// Kept so any file that still imports STORE keeps working. Do not use it for new code, use resolveStore().
export const STORE = DEFAULT_STORE;

export const STORE_PROFILES = Object.freeze({
  sa: { currency: 'SAR', country: 'SA', callingCode: '966', hosts: ['weewonderssa'] },
  lb: { currency: 'USD', country: 'LB', callingCode: '961', hosts: ['weewonderslb'] }
});

// Order of trust: the store the pixel declared, then the website host, then the currency, then the default.
export function resolveStore({ declared, url, currency } = {}) {
  const d = String(declared || '').toLowerCase();
  if (STORE_PROFILES[d]) return d;
  const u = String(url || '').toLowerCase();
  for (const [key, p] of Object.entries(STORE_PROFILES)) {
    if (p.hosts.some((h) => u.includes(h))) return key;
  }
  const c = String(currency || '').toUpperCase();
  for (const [key, p] of Object.entries(STORE_PROFILES)) {
    if (p.currency === c) return key;
  }
  return DEFAULT_STORE;
}

export const EVENT_NAMES = Object.freeze({
  PAGE_VIEW: 'PageView', VIEW_CONTENT: 'ViewContent', ADD_TO_CART: 'WW_AddToCart',
  CHECKOUT: 'WW_Checkout', PAYMENT: 'WW_Payment', WHATSAPP: 'WW_WhatsApp', PURCHASE: 'WW_Order'
});

// Events the pixel is allowed to send to /api/events.
// CHANGE: PURCHASE (WW_Order) was missing, so the pixel's order copy (the one that carries fbc/fbp) was rejected.
export const BROWSER_EVENTS = new Set([
  EVENT_NAMES.PAGE_VIEW, EVENT_NAMES.VIEW_CONTENT, EVENT_NAMES.ADD_TO_CART,
  EVENT_NAMES.CHECKOUT, EVENT_NAMES.PAYMENT, EVENT_NAMES.WHATSAPP, EVENT_NAMES.PURCHASE
]);

