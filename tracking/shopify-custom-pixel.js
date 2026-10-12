/** WeeWonders Saudi Arabia Shopify custom pixel. Paste this entire file in Customer events. */
const STORE = 'sa';
const DEFAULT_CURRENCY = 'SAR';
const DEFAULT_COUNTRY = 'SA';
const META_PIXEL_ID = '1032874294681740';
// Replace this single deployment URL before connecting the pixel. Do not use a theme/window variable.
const TRACKING_ENDPOINT = 'https://REPLACE-WITH-YOUR-TRACKING-HOST.com/api/events';

!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', META_PIXEL_ID);

async function getCookie(name) {
  try { return (await browser.cookie.get(name)) || null; } catch (_) { return null; }
}
async function getFbc(event) {
  const saved = await getCookie('_fbc');
  if (saved) return saved;
  try {
    const fbclid = new URL(event.context?.document?.location?.href || '').searchParams.get('fbclid');
    return fbclid ? `fb.1.${Date.now()}.${fbclid}` : null;
  } catch (_) { return null; }
}
function attribution(event) {
  try {
    const params = new URL(event.context?.document?.location?.href || '').searchParams;
    return Object.fromEntries(['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ad_id','fbclid']
      .map((key) => [key, params.get(key)]).filter(([, value]) => value));
  } catch (_) { return {}; }
}
function contents(lines = []) {
  return lines.map((line) => ({
    id: String(line.merchandise?.product?.id || line.merchandise?.id || line.productVariant?.product?.id || line.productVariant?.id || ''),
    quantity: Number(line.quantity || 1),
    item_price: Number(line.cost?.amount || line.cost?.totalAmount?.amount || line.merchandise?.price?.amount || line.productVariant?.price?.amount || 0)
  })).filter((line) => line.id);
}
function customer(checkout = {}) {
  const address = checkout.shippingAddress || checkout.billingAddress || {};
  return { email: checkout.email, phone: checkout.phone, first_name: address.firstName, last_name: address.lastName,
    city: address.city, zip: address.zip, country: address.countryCode || DEFAULT_COUNTRY, external_id: checkout.customer?.id };
}
async function track(eventName, standard, event, customData = {}) {
  const checkout = event.data?.checkout || {};
  const eventId = eventName === 'WW_Order' && checkout.order?.id ? `order_${checkout.order.id}` : `${STORE}_${eventName}_${event.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  if (standard) fbq('track', eventName, customData, { eventID: eventId }); else fbq('trackCustom', eventName, customData, { eventID: eventId });
  const [fbc, fbp] = await Promise.all([getFbc(event), getCookie('_fbp')]);
  const sourceUrl = event.context?.document?.location?.href || '';
  if (TRACKING_ENDPOINT.includes('REPLACE-WITH')) { console.warn('[WeeWonders] Set TRACKING_ENDPOINT before connecting this pixel.'); return; }
  fetch(TRACKING_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ event_name: eventName, event_id: eventId, event_time: Math.floor(Date.now() / 1000), event_source_url: sourceUrl,
      fbc, fbp, attribution: attribution(event), customer: customer(checkout), custom_data: { ...customData, store: STORE } }) }).catch(() => {});
}
analytics.subscribe('page_viewed', (event) => track('PageView', true, event));
analytics.subscribe('product_viewed', (event) => { const v = event.data?.productVariant || {}; track('ViewContent', true, event, { value: Number(v.price?.amount || 0), currency: v.price?.currencyCode || DEFAULT_CURRENCY, content_ids: [String(v.product?.id || v.id || '')].filter(Boolean), content_type: 'product', contents: contents([{ productVariant: v }]) }); });
analytics.subscribe('product_added_to_cart', (event) => { const l = event.data?.cartLine || {}; track('WW_AddToCart', false, event, { value: Number(l.cost?.totalAmount?.amount || 0), currency: l.cost?.totalAmount?.currencyCode || DEFAULT_CURRENCY, num_items: Number(l.quantity || 1), content_ids: contents([l]).map((x) => x.id), content_type: 'product', contents: contents([l]) }); });
function checkoutData(event) { const c = event.data?.checkout || {}; const lines = c.lineItems || []; return { value: Number(c.totalPrice?.amount || 0), currency: c.currencyCode || DEFAULT_CURRENCY, num_items: lines.reduce((total, line) => total + Number(line.quantity || 0), 0), content_ids: contents(lines).map((x) => x.id), content_type: 'product', contents: contents(lines), order_id: c.order?.id ? String(c.order.id) : undefined }; }
analytics.subscribe('checkout_started', (event) => track('WW_Checkout', false, event, checkoutData(event)));
analytics.subscribe('payment_info_submitted', (event) => track('WW_Payment', false, event, checkoutData(event)));
analytics.subscribe('checkout_completed', (event) => track('WW_Order', false, event, checkoutData(event)));
