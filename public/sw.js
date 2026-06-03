const CACHE_NAME = 'lazisnu-pos-static-v1';
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.png',
  '/app-icon.png',
  '/icon-192.png',
  '/icon-512.png'
];

const isExternalDataRequest = (url) => (
  url.hostname.includes('supabase.co')
  || url.hostname.includes('script.google.com')
  || url.hostname.includes('googleusercontent.com')
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || isExternalDataRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;

        return fetch(request).then((networkResponse) => {
          const responseCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
          return networkResponse;
        });
      })
    );
  }
});
