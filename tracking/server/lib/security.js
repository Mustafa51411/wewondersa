import { STORE } from './tracking-config.js';

const DEFAULT_ORIGINS = ['https://weewonderssa.com', 'https://www.weewonderssa.com'];

export function allowedOrigins() {
  return (process.env.CAPI_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean)
    .concat(DEFAULT_ORIGINS).filter((origin, index, all) => all.indexOf(origin) === index);
}
export function applyCors(req, res) {
  // Shopify customer-event pixels run in a sandbox that uses Origin: null.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return true;
}
export function safeText(value, max = 200) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
export function safeAttribution(input = {}) {
  return Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ad_id','fbclid']
    .map((key) => [key, safeText(input[key], 180)]).filter(([, value]) => value));
}
export function clientIp(req) { return safeText(req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress, 64); }
export { STORE };
