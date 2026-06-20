// Subsumio service worker v3.
// Stale-while-revalidate caching for dashboard API calls + static assets.
// Background sync for offline mutations (POST/PUT/DELETE to Brain API).

const STATIC_CACHE = "subsumio-static-v3";
const API_CACHE = "subsumio-api-v3";
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

/** Background sync queue for offline mutations (in-memory; SW has no localStorage) */
const SYNC_TAG = "subsumio-sync";
let syncQueue = [];

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(processSyncQueue());
  }
});

function queueMutation(method, url, body) {
  syncQueue.push({ method, url, body, timestamp: Date.now() });
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

  // Offline mutations → queue + return 202
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req.clone()).catch(() => {
        queueMutation(req.method, req.url, null);
        return new Response(JSON.stringify({ queued: true, offline: true }), {
          status: 202,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    return;
  }

  // Brain API GET → stale-while-revalidate
  if (req.method === "GET" && (url.pathname.startsWith("/api/"))) {
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

// Expose queueMutation globally for the app to call
self.queueBrainMutation = queueMutation;
