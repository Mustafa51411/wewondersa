import http from 'node:http';
import eventsHandler from './api/events.js';
import whatsappHandler from './api/whatsapp-ref.js';
import waClickHandler from './api/wa-click.js';
import checkoutAttributionHandler from './api/checkout-attribution.js';
import webhooksHandler from './api/webhooks/shopify.js';
import healthHandler from './api/health.js';

const PORT = process.env.PORT || 3000;

function adaptResponse(res) {
  res.status = function(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function(data) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  adaptResponse(res);

  // Parse body
  const buffers = [];
  for await (const chunk of req) {
    buffers.push(chunk);
  }
  const rawBody = Buffer.concat(buffers).toString('utf-8');
  try {
    req.body = rawBody ? JSON.parse(rawBody) : {};
  } catch (_) {
    req.body = rawBody;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/events' || pathname === '/v1/events') {
      return await eventsHandler(req, res);
    }
    if (pathname === '/api/whatsapp-ref' || pathname === '/v1/whatsapp-ref') {
      return await whatsappHandler(req, res);
    }
    // NEW routes: WhatsApp click record and checkout click data
    if (pathname === '/api/wa-click' || pathname === '/v1/wa-click') {
      return await waClickHandler(req, res);
    }
    if (pathname === '/api/checkout-attribution' || pathname === '/v1/checkout-attribution') {
      return await checkoutAttributionHandler(req, res);
    }
    if (pathname === '/api/webhooks/shopify' || pathname === '/v1/webhooks/shopify') {
      return await webhooksHandler(req, res);
    }
    if (pathname === '/api/health' || pathname === '/') {
      return await healthHandler(req, res);
    }

    res.status(404).json({ error: 'Not Found', path: pathname });
  } catch (err) {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Server Error', message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`WeeWonders Tracking Server running on http://localhost:${PORT}`);
});

