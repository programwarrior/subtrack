const CACHE = "subtrack-v8";
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const CORE = [`${BASE}/`, `${BASE}/manifest.webmanifest`, `${BASE}/icon.svg`];
self.addEventListener("install", (event) => event.waitUntil(Promise.all([caches.open(CACHE).then((cache) => cache.addAll(CORE)), self.skipWaiting()])));
self.addEventListener("activate", (event) => event.waitUntil(Promise.all([
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("subtrack-") && key !== CACHE).map((key) => caches.delete(key)))),
  self.clients.claim(),
])));
self.addEventListener("message", (event) => { if (event.data === "SKIP_WAITING") void self.skipWaiting(); });
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request, event.request.mode === "navigate" ? { cache: "no-store" } : undefined).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
