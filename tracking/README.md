# WeeWonders Tracking Integration — Saudi Arabia (weewonderssa.com)

This repository contains the complete tracking architecture required by the Developer Scope of Work (SOW):
1. **Zero Browser Tokens:** No private Meta tokens or credentials in Liquid or JavaScript.
2. **Shopify Custom Pixel:** Handles both browser-side events and server CAPI forwarding with the same deduplication `event_id`.
3. **Turnkey Server Layer:** Contained in `./server`, deployable to Vercel in 1 click.
4. **Theme Attribution & WhatsApp Code:** Theme snippets that persist UTMs and click IDs (`_fbc`, `_fbp`) into cart attributes, and link WhatsApp orders back to the original ad click.

---

## 📋 Implementation Steps

### Step 1: Deploy the Server (1 Minute)
Deploy the folder `tracking/server` to Vercel (or Render / any Node.js host).
Add the environment variables:
- `META_PIXEL_ID` = `1032874294681740`
- `META_CAPI_ACCESS_TOKEN` = *(Your secret token from PNCL)*
- `SHOPIFY_WEBHOOK_SECRET_SA` = *(From Saudi Shopify Admin > Settings > Notifications > Webhooks)*

Your endpoint will look like: `https://your-weewonders-tracking.vercel.app`

### Step 2: Add Shopify Custom Pixel
1. Open **Shopify Admin → Settings → Customer events**.
2. Click **Add custom pixel** and name it: `WeeWonders Meta CAPI & Browser Pixel`.
3. Open `shopify-custom-pixel.js`, replace:
   `const TRACKING_ENDPOINT = 'https://REPLACE-WITH-YOUR-TRACKING-HOST.com/api/events';`
   with your real deployed URL (e.g. `https://your-weewonders-tracking.vercel.app/api/events`).
4. Click **Save** and then **Connect**.

### Step 3: Configure Shopify Webhook
1. Go to **Settings → Notifications → Webhooks**.
2. Create webhook:
   - **Event:** `Order payment` (or `Order creation`)
   - **Format:** `JSON`
   - **URL:** `https://your-weewonders-tracking.vercel.app/api/webhooks/shopify`

### Step 4: Verify in Meta Test Events
Open **Meta Events Manager → Dataset 1032874294681740 → Test events**:
- Place a test order or visit pages:
  - `PageView`
  - `ViewContent`
  - `WW_AddToCart`
  - `WW_Checkout`
  - `WW_Payment`
  - `WW_Order`
You will see both **Browser** and **Server** events receiving the same Event ID and showing as **Deduplicated**.
