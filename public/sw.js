// Subsumio service worker v6.
//
// Caches only static assets. API responses — matters, documents, portal and
// data-room reads — are confidential and access-controlled (walls, grants,
// revocations); they always go to the network and are never stored in the
// browser. Writes are never queued offline: a write replayed later against a
// changed matter is worse than a clear "no connection" error.

const STATIC_CACHE = "subsumio-static-v6";
const PRECACHE = ["/offline.html", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Drops every other cache — including the API cache earlier versions kept.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle http(s) requests — ignore chrome-extension://, moz-extension://, etc.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // Only handle same-origin requests; let cross-origin pass through untouched.
  if (url.origin !== self.location.origin) return;

  // API: network only, never cached.
  if (url.pathname.startsWith("/api/")) return;

  // Navigation fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/offline.html").then((res) => res ?? Response.error()))
    );
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
  }
});

// Push notification click — focus existing window or open new one with deep link
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/dashboard";
  const targetPath = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus an open window on the same page area if there is one
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.postMessage({ type: "push-click", url: targetUrl });
          return client.focus();
        }
      }
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
