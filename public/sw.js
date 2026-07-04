// Subsumio service worker v5.
// Stale-while-revalidate caching for dashboard API calls + static assets.
// Background sync for offline mutations (POST/PUT/DELETE to Brain API).

const STATIC_CACHE = "subsumio-static-v5";
const API_CACHE = "subsumio-api-v5";
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE && k !== API_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Handle SKIP_WAITING message from app update banner
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/** Stale-while-revalidate for Brain API GET calls */
async function apiFetch(req) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then(async (res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
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
      const res = await fetch(item.url, {
        method: item.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.body),
      });
      if (res.ok) {
        syncQueue.shift();
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle http(s) requests — ignore chrome-extension://, moz-extension://, etc.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Only handle same-origin requests; let cross-origin pass through untouched.
  if (url.origin !== self.location.origin) return;

  // Navigation fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline.html").then((res) => res ?? Response.error()))
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
      })
    );
    return;
  }

  // Brain API GET → stale-while-revalidate
  if (req.method === "GET" && url.pathname.startsWith("/api/")) {
    event.respondWith(apiFetch(req));
    return;
  }

  // Static assets (JS, CSS, fonts, icons) → cache first
  if (req.method === "GET" && url.pathname.match(/\.(js|css|woff2?|png|svg|ico)$/)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ??
          fetch(req).then(async (res) => {
            if (res.ok) {
              const cache = await caches.open(STATIC_CACHE);
              cache.put(req, res.clone());
            }
            return res;
          })
      )
    );
    return;
  }
});

// Push notification click — focus existing window or open new one with deep link
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";
  const targetPath = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if found
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.postMessage({ type: "push-click", url: targetUrl });
          return client.focus();
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath);
      }
    })
  );
});

// Push event — display notification (needed for Android/Chrome)
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Subsumio", body: event.data.text() };
  }
  const title = payload.title || "Subsumio";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload.data || {},
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Expose queueMutation globally for the app to call
self.queueBrainMutation = queueMutation;
