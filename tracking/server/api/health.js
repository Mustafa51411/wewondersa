export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const hasToken = Boolean(process.env.META_CAPI_ACCESS_TOKEN);
  const pixelId = process.env.META_PIXEL_ID || '1032874294681740';
  const hasSaWebhook = Boolean(process.env.SHOPIFY_WEBHOOK_SECRET_SA || process.env.SHOPIFY_WEBHOOK_SECRET);
  const hasLbWebhook = Boolean(process.env.SHOPIFY_WEBHOOK_SECRET_LB || process.env.SHOPIFY_WEBHOOK_SECRET);
  const hasKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

  return res.status(200).json({
    status: 'ok',
    service: 'WeeWonders Custom Tracking Server',
    pixel_id: pixelId,
    configured: {
      meta_capi_token: hasToken,
      shopify_webhook_sa: hasSaWebhook,
      shopify_webhook_lb: hasLbWebhook,
      external_kv: hasKv
    },
    stores: ['sa', 'lb'],
    timestamp: new Date().toISOString()
  });
}
