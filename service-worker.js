const cacheName = "fdn-osd-v17-1";
const appFiles = [
  "./",
  "./index.html",
  "./styles.css?v=17.1",
  "./app.js?v=17.1",
  "./advanced.js?v=17.1",
  "./advanced-v12.js?v=17.1",
  "./advanced-v13.js?v=17.1",
  "./advanced-v14.js?v=17.1",
  "./advanced-v15.js?v=17.1",
  "./advanced-v16.js?v=17.1",
  "./advanced-v17.js?v=17.1",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/osd-logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(appFiles)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== cacheName).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) caches.open(cacheName).then(cache => cache.put("./index.html", response.clone()));
        return response;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(cacheName).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    }).catch(() => new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    }))
  );
});
