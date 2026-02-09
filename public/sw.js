const CACHE_NAME = "buddy-v1";

// Minimal service worker for PWA install support
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass through — no caching for now since it's a local-first app
  event.respondWith(fetch(event.request));
});
