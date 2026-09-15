// Minimal service worker — does nothing, just satisfies the installability requirement
self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

// The fetch handler is what Chrome 81 requires for the install prompt
self.addEventListener('fetch', function(event) {
    event.respondWith(fetch(event.request));
});