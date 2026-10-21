import fs from 'node:fs';
import path from 'node:path';

// In-memory cache
const memoryStore = new Map();
const processedEvents = new Set();
const processedOrders = new Set();

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Initialize local file persistence if directory can be used
function loadLocalData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.refs) {
        for (const [k, v] of Object.entries(parsed.refs)) {
          memoryStore.set(k, v);
        }
      }
      if (Array.isArray(parsed.orders)) {
        parsed.orders.forEach(o => processedOrders.add(String(o)));
      }
    }
  } catch (err) {
    // Non-fatal, fallback to memory
  }
}

function saveLocalData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      refs: Object.fromEntries(memoryStore.entries()),
      orders: Array.from(processedOrders)
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    // Non-fatal on serverless read-only filesystems
  }
}

loadLocalData();

/**
 * Check if external KV (e.g. Vercel KV / Upstash) is configured
 */
export function hasExternalKV() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function kvFetch(command, ...args) {
  const url = `${process.env.KV_REST_API_URL}/${command}/${args.map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  if (!res.ok) throw new Error(`KV error ${res.status}`);
  const json = await res.json();
  return json.result;
}

/**
 * Store WhatsApp reference attribution
 */
export async function saveWhatsAppRef(code, attributionData, store = 'sa') {
  if (!hasExternalKV()) throw new Error('Persistent storage is not configured');
  const normalizedCode = String(code).trim().toUpperCase();
  const entry = {
    ...attributionData,
    code: normalizedCode,
    updated_at: new Date().toISOString()
  };

  await kvFetch('set', `waref:${store}:${normalizedCode}`, JSON.stringify(entry), 'EX', '2592000');

  return entry;
}

/**
 * Get WhatsApp reference attribution
 */
export async function getWhatsAppRef(code, store = 'sa') {
  if (!code) return null;
  if (!hasExternalKV()) return null;
  const normalizedCode = String(code).trim().toUpperCase();

  const remote = await kvFetch('get', `waref:${store}:${normalizedCode}`);
  return remote ? (typeof remote === 'string' ? JSON.parse(remote) : remote) : null;
}

export async function saveCheckoutAttribution(checkoutToken, attributionData, store = 'sa') {
  if (!hasExternalKV()) throw new Error('Persistent storage is not configured');
  const token = String(checkoutToken || '');
  if (!token) throw new Error('checkout_token is required');
  await kvFetch('set', `checkout:${store}:${token}`, JSON.stringify({ ...attributionData, updated_at: new Date().toISOString() }), 'EX', '604800');
}

export async function getCheckoutAttribution(checkoutToken, store = 'sa') {
  if (!checkoutToken || !hasExternalKV()) return null;
  const remote = await kvFetch('get', `checkout:${store}:${String(checkoutToken)}`);
  return remote ? (typeof remote === 'string' ? JSON.parse(remote) : remote) : null;
}

/**
 * Event deduplication: check and mark
 */
export function isEventProcessed(eventId) {
  if (!eventId) return false;
  return processedEvents.has(String(eventId));
}

export function markEventProcessed(eventId) {
  if (!eventId) return;
  processedEvents.add(String(eventId));
  // Keep memory cache size bounded (max 5000 events)
  if (processedEvents.size > 5000) {
    const first = processedEvents.values().next().value;
    processedEvents.delete(first);
  }
}

/**
 * Order deduplication: check and mark
 */
export function isOrderProcessed(orderId) {
  if (!orderId) return false;
  return processedOrders.has(String(orderId));
}

export function markOrderProcessed(orderId) {
  if (!orderId) return;
  processedOrders.add(String(orderId));
  saveLocalData();
}

export async function reserveOrder(orderId, store = 'sa') {
  if (!orderId) return false;
  if (!hasExternalKV()) return !isOrderProcessed(orderId);
  const result = await kvFetch('set', `order:${store}:${orderId}`, 'processing', 'NX', 'EX', '2592000');
  return result === 'OK';
}

export async function releaseOrder(orderId, store = 'sa') {
  if (orderId && hasExternalKV()) await kvFetch('del', `order:${store}:${orderId}`);
}
