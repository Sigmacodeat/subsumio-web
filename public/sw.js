// Sigmabrain service worker v2.
// Stale-while-revalidate caching for dashboard API calls + static assets.
// Background sync for offline mutations (POST/PUT/DELETE to Brain API).

const STATIC_CACHE = "sigmabrain-static-v2";
const API_CACHE = "sigmabrain-api-v2";
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== API_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim()),
  );
});

/** Stale-while-revalidate for Brain API GET calls */
async function apiFetch(req) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(async (res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached ?? network;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Navigation fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline.html").then((res) => res ?? Response.error())),
    );
    return;
  }

  // Brain API GET → stale-while-revalidate
  if (req.method === "GET" && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/brain"))) {
    event.respondWith(apiFetch(req));
    return;
  }

  // Static assets (JS, CSS, fonts, icons) → cache first
  if (req.method === "GET" && (url.pathname.match(/\.(js|css|woff2?|png|svg|ico)$/))) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ?? fetch(req).then(async (res) => {
          if (res.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        }),
      ),
    );
    return;
  }
});

/** Background sync queue for offline mutations */
const SYNC_TAG = "brain-sync";
self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processSyncQueue());
  }
});

let syncQueue = [];

try {
  const stored = self.localStorage?.getItem("sw_sync_queue");
  if (stored) syncQueue = JSON.parse(stored);
} catch {}

function queueMutation(method, url, body) {
  syncQueue.push({ method, url, body, timestamp: Date.now() });
  try { self.localStorage?.setItem("sw_sync_queue", JSON.stringify(syncQueue)); } catch {}
  self.registration?.sync?.register(SYNC_TAG).catch(() => {});
}

async function processSyncQueue() {
  while (syncQueue.length > 0) {
    const item = syncQueue[0];
    try {
      const res = await fetch(item.url, { method: item.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body) });
      if (res.ok) { syncQueue.shift(); } else { break; }
    } catch { break; }
  }
  try { self.localStorage?.setItem("sw_sync_queue", JSON.stringify(syncQueue)); } catch {}
}

// Expose queueMutation globally for the app to call
self.queueBrainMutation = queueMutation;
