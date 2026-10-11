/* Paste into Shopify Admin > Settings > Customer events > Custom pixel.
 * Do not add any Meta token here. It belongs only in the server endpoint.
 */
const TRACKING_ENDPOINT = 'https://REPLACE-WITH-YOUR-TRACKING-HOST.example/v1/events';
const STORE = 'sa';
const EVENTS = {
  page_viewed: 'PageView', product_viewed: 'ViewContent',
  product_added_to_cart: 'WW_AddToCart', cart_viewed: 'WW_Cart',
  checkout_started: 'WW_Checkout', checkout_contact_info_submitted: 'WW_Checkout',
  payment_info_submitted: 'WW_Payment', checkout_completed: 'WW_Order'
};

function eventId(event) {
  const orderId = event?.data?.checkout?.order?.id;
  return orderId ? `order_${orderId}` : `${STORE}_${event.name}_${event.id}`;
}
async function cookie(name) {
  try { return (await browser.cookie.get(name))?.value || null; } catch (_) { return null; }
}
async function forward(event) {
  const checkout = event.data?.checkout || {};
  const cart = event.data?.cart || {};
  await fetch(TRACKING_ENDPOINT, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event_name: EVENTS[event.name], event_id: eventId(event), store: STORE,
      value: checkout.totalPrice?.amount || cart.cost?.totalAmount?.amount || null,
      currency: checkout.currencyCode || cart.cost?.totalAmount?.currencyCode || 'SAR',
      num_items: checkout.lineItems?.length || cart.lineItems?.length || null,
      order_id: checkout.order?.id || null, fbc: await cookie('_fbc'), fbp: await cookie('_fbp'),
      event_source_url: event.context?.document?.location?.href || null
    })
  });
}
Object.keys(EVENTS).forEach((name) => analytics.subscribe(name, forward));
