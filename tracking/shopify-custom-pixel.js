/**
 * WeeWonders Saudi Arabia (weewonderssa.com) - Shopify Custom Pixel
 * 
 * Setup instructions:
 * 1. In Shopify Admin, navigate to: Settings > Customer events > Add custom pixel.
 * 2. Name the pixel: "WeeWonders Meta CAPI and Browser Pixel".
 * 3. Replace TRACKING_ENDPOINT with your deployed server URL (e.g. https://your-server.vercel.app/api/events).
 * 4. Save and click "Connect".
 * 
 * Complies strictly with Meta Conversions API deduplication and SOW Data Rules.
 */

// Replace with your live tracking server endpoint
const TRACKING_ENDPOINT = 'https://REPLACE-WITH-YOUR-TRACKING-HOST.com/api/events';
const STORE = 'sa';
const DEFAULT_CURRENCY = 'SAR';
const META_PIXEL_ID = '1032874294681740';

// 1. Initialize Meta Browser Pixel inside Customer Events Sandbox
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', META_PIXEL_ID);

// 2. Cookie & Attribution Helpers
async function getCookie(name) {
  try {
    const c = await browser.cookie.get(name);
    return c?.value || null;
  } catch (_) {
    return null;
  }
}

async function getFbc(event) {
  let fbc = await getCookie('_fbc');
  if (!fbc) {
    try {
      const urlStr = event.context?.document?.location?.href || '';
      if (urlStr.includes('fbclid=')) {
        const u = new URL(urlStr);
        const fbclid = u.searchParams.get('fbclid');
        if (fbclid) {
          fbc = `fb.1.${Date.now()}.${fbclid}`;
        }
      }
    } catch (_) {}
  }
  return fbc;
}

// 3. Event Handling and Deduplication Engine
async function trackEvent(metaEventName, isStandard, event, customData = {}, userContact = {}) {
  const checkout = event.data?.checkout || {};
  const orderId = checkout.order?.id;

  // Single shared event ID for browser + server deduplication
  let eventId;
  if (metaEventName === 'WW_Order' && orderId) {
    eventId = `order_${orderId}`;
  } else if (orderId) {
    eventId = `order_${orderId}`;
  } else {
    eventId = `${STORE}_${metaEventName}_${event.id || (Date.now() + '_' + Math.random().toString(36).slice(2, 8))}`;
  }

  // 3a. Fire Meta Browser Pixel Event
  if (typeof fbq === 'function') {
    try {
      if (isStandard) {
        fbq('track', metaEventName, customData, { eventID: eventId });
      } else {
        fbq('trackCustom', metaEventName, customData, { eventID: eventId });
      }
    } catch (e) {
      console.warn('[Pixel] Browser tracking error:', e);
    }
  }

  // 3b. Read Attribution & Send to Server CAPI
  const [fbc, fbp] = await Promise.all([getFbc(event), getCookie('_fbp')]);
  const sourceUrl = event.context?.document?.location?.href || null;

  try {
    fetch(TRACKING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: metaEventName,
        event_id: eventId,
        store: STORE,
        value: customData.value || null,
        currency: customData.currency || DEFAULT_CURRENCY,
        num_items: customData.num_items || null,
        order_id: customData.order_id || null,
        fbc: fbc,
        fbp: fbp,
        event_source_url: sourceUrl,
        user_data: {
          email: userContact.email || checkout.email || null,
          phone: userContact.phone || checkout.phone || null,
          country: checkout.shippingAddress?.countryCode || 'SA'
        }
      }),
      keepalive: true
    }).catch(function(err) {
      console.warn('[Pixel] Server forward error:', err);
    });
  } catch (_) {}
}

// 4. Subscriptions
analytics.subscribe('page_viewed', async (event) => {
  await trackEvent('PageView', true, event, {});
});

analytics.subscribe('product_viewed', async (event) => {
  const productVariant = event.data?.productVariant || {};
  const price = productVariant.price?.amount || null;
  const currency = productVariant.price?.currencyCode || DEFAULT_CURRENCY;
  await trackEvent('ViewContent', true, event, {
    value: price ? Number(price) : null,
    currency: currency
  });
});

analytics.subscribe('product_added_to_cart', async (event) => {
  const cartLine = event.data?.cartLine || {};
  const cost = cartLine.cost?.totalAmount?.amount || null;
  const currency = cartLine.cost?.totalAmount?.currencyCode || DEFAULT_CURRENCY;
  await trackEvent('WW_AddToCart', false, event, {
    value: cost ? Number(cost) : null,
    currency: currency,
    num_items: cartLine.quantity || 1
  });
});

analytics.subscribe('checkout_started', async (event) => {
  const checkout = event.data?.checkout || {};
  const amount = checkout.totalPrice?.amount || null;
  const currency = checkout.currencyCode || DEFAULT_CURRENCY;
  const numItems = checkout.lineItems?.length || null;
  await trackEvent('WW_Checkout', false, event, {
    value: amount ? Number(amount) : null,
    currency: currency,
    num_items: numItems
  });
});

analytics.subscribe('payment_info_submitted', async (event) => {
  const checkout = event.data?.checkout || {};
  const amount = checkout.totalPrice?.amount || null;
  const currency = checkout.currencyCode || DEFAULT_CURRENCY;
  const numItems = checkout.lineItems?.length || null;
  await trackEvent('WW_Payment', false, event, {
    value: amount ? Number(amount) : null,
    currency: currency,
    num_items: numItems
  });
});

analytics.subscribe('checkout_completed', async (event) => {
  const checkout = event.data?.checkout || {};
  const amount = checkout.totalPrice?.amount || null;
  const currency = checkout.currencyCode || DEFAULT_CURRENCY;
  const numItems = checkout.lineItems?.length || null;
  const orderId = checkout.order?.id || null;
  await trackEvent('WW_Order', false, event, {
    value: amount ? Number(amount) : null,
    currency: currency,
    num_items: numItems,
    order_id: orderId
  }, {
    email: checkout.email,
    phone: checkout.phone
  });
});
