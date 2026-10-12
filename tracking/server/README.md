# WeeWonders Tracking Server (CAPI & Webhooks)

Production-ready server layer for **weewonderssa.com** (Saudi Arabia) and **weewonderslb.com** (Lebanon).

---

## 🚀 Quick Deployment Options

### Option 1: Deploy to Vercel (Recommended - 1 Minute)
1. Push this repository to GitHub or upload the `tracking/server` folder.
2. Go to [vercel.com](https://vercel.com) and click **Add New Project** → Import repository (set Root Directory to `tracking/server` if deploying as a standalone project).
3. Under **Environment Variables**, add:
   - `META_PIXEL_ID` = `1032874294681740`
   - `META_CAPI_ACCESS_TOKEN` = *(Your secret Meta Access Token from PNCL)*
   - `SHOPIFY_WEBHOOK_SECRET_SA` = *(From Saudi Shopify Admin > Notifications > Webhooks)*
   - `SHOPIFY_WEBHOOK_SECRET_LB` = *(From Lebanon Shopify Admin > Notifications > Webhooks)*
   - *(Optional for testing)* `TEST_EVENT_CODE` = *(From Meta Events Manager > Test Events)*
4. Click **Deploy**. Your live endpoint will be `https://your-project.vercel.app`.

### Option 2: Run locally or on a VPS (Node.js)
```bash
cd tracking/server
cp .env.example .env
# Edit .env with your credentials
node server.js
```
The server will be running on `http://localhost:3000`.

---

## 📡 Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/events` | `POST` | Receives browser & Custom Pixel events, hashes user data with SHA-256, and sends to Meta CAPI. Deduplicates with `event_id`. |
| `/api/whatsapp-ref` | `POST` / `GET` | Saves attribution (`fbc`, `fbp`, UTMs, landing page) for WhatsApp clicks and emits `WW_WhatsApp`. |
| `/api/webhooks/shopify` | `POST` | Receives Shopify `orders/paid` webhooks, verifies HMAC signature, matches WhatsApp ref code or cart attributes, and sends `WW_Order`. |
| `/api/health` | `GET` | Health check and configuration status. |

---

## 🔗 Shopify Webhook Setup
In each store's Shopify Admin:
1. Go to **Settings → Notifications → Webhooks** (or **Settings → Customer events**).
2. Click **Create webhook**:
   - **Event**: `Order creation` or `Order payment`
   - **Format**: `JSON`
   - **URL**: `https://your-server-domain.com/api/webhooks/shopify`
   - **Webhook API version**: `Latest`
3. Copy the **Webhook signing secret** at the bottom of the page and paste it into the server's environment variables (`SHOPIFY_WEBHOOK_SECRET_SA` or `SHOPIFY_WEBHOOK_SECRET_LB`).
