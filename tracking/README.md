# WeeWonders tracking deployment — Saudi Arabia

This theme intentionally contains **no Meta Pixel or CAPI access token**. A token in Liquid or JavaScript is public and must never be deployed in a theme.

## Required Shopify configuration

1. Deploy the private tracking endpoint from the developer SOW. Put `META_CAPI_ACCESS_TOKEN` only in its encrypted server environment.
2. In Shopify Admin, open **Settings → Customer events → Add custom pixel** and paste `shopify-custom-pixel.js` after replacing `TRACKING_ENDPOINT` with the endpoint's HTTPS address.
3. Create Shopify `orders/paid` (and, if needed, `orders/create`) webhooks to the endpoint. Paid orders must emit `WW_Order` using `event_id = order_{order id}`.
4. Test browser/server deduplication in Meta Events Manager before disabling Shopify's native Meta integration.

## Test matrix

- Product view → `ViewContent`
- Add to cart → `WW_AddToCart`
- Start checkout → `WW_Checkout`
- Payment submitted → `WW_Payment`
- Paid order webhook → `WW_Order`

Only SOW-approved fields may be accepted: event ID/name, store, value, currency, item count, order ID, fbc/fbp, server-side hashed contact data, server-side IP/UA, country and source URL.
