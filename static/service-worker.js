/* Daily English Journal — service worker
   Strategy:
     • Static shell (HTML/CSS/JS/icons) → cache-first.
     • Everything else (API calls)     → network-only.
   The API depends on OpenAI being online, so caching it would be misleading. */

const CACHE = "journal-shell-v1";
const SHELL = [
  "/",
  "/static/style.css",
  "/static/app.js",
  "/static/manifest.json",
  "/static/icon-192.png",
  "/static/icon-512.png",
  "/static/icon-180.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API calls — they need fresh data + a working network.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          // Cache same-origin GET responses for next time.
          if (res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match("/")); // offline fallback to shell
    })
  );
});
