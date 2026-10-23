'use strict';

const CACHE = 'wk8-shell-v12';
const CONTENT_CACHE = 'wk8-content-v1';
const CONTENT_LIMIT = 160;
const BOOK_CACHE_PREFIX = 'wk8-offline-book-';
const LIBRARY_CACHE_PREFIX = 'wk8-library-book-';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.webmanifest',
  '/js/core.js',
  '/js/offline.js',
  '/js/library.js',
  '/js/ui.js',
  '/js/pages.js',
  '/js/reader.js',
  '/js/main.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

function isCacheableApi(url) {
  return (
    url.pathname === '/api/home' ||
    url.pathname === '/api/sugoi' ||
    url.pathname === '/api/library' ||
    /^\/api\/book\/\d+$/.test(url.pathname) ||
    /^\/api\/chapter\/\d+\/\d+$/.test(url.pathname) ||
    /^\/api\/library\/[a-z0-9]+$/.test(url.pathname) ||
    /^\/api\/library\/[a-z0-9]+\/chapter\/[a-z0-9]+$/.test(url.pathname) ||
    /^\/api\/library\/[a-z0-9]+\/cover$/.test(url.pathname) ||
    url.pathname === '/api/image'
  );
}

function isLibraryApi(url) {
  return (
    url.pathname === '/api/library' ||
    /^\/api\/library\/[a-z0-9]+$/.test(url.pathname) ||
    /^\/api\/library\/[a-z0-9]+\/chapter\/[a-z0-9]+$/.test(url.pathname) ||
    /^\/api\/library\/[a-z0-9]+\/cover$/.test(url.pathname)
  );
}

async function trimContentCache() {
  const cache = await caches.open(CONTENT_CACHE);
  const keys = await cache.keys();
  if (keys.length <= CONTENT_LIMIT) return;
  await Promise.all(keys.slice(0, keys.length - CONTENT_LIMIT).map((key) => cache.delete(key)));
}

async function cacheApiResponse(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CONTENT_CACHE);
  await cache.put(request, response);
  await trimContentCache();
}

function offlineResponse() {
  return new Response(JSON.stringify({ error: '当前处于离线状态，且没有可用缓存' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function matchDownloaded(request) {
  const names = await caches.keys();
  for (const name of names) {
    if (!name.startsWith(BOOK_CACHE_PREFIX) && !name.startsWith(LIBRARY_CACHE_PREFIX)) continue;
    const cache = await caches.open(name);
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  return null;
}

function handleApiRequest(event, request, url) {
  if (!isCacheableApi(url)) return;
  event.respondWith((async () => {
    const downloaded = await matchDownloaded(request);
    if (downloaded) return downloaded;
    if (isLibraryApi(url)) {
      try {
        return await fetch(request);
      } catch {
        return offlineResponse();
      }
    }
    const cache = await caches.open(CONTENT_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          cacheApiResponse(request, copy).catch(() => {});
        }
        return response;
      })
      .catch(() => null);
    return cached || (await network) || offlineResponse();
  })());
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE && key !== CONTENT_CACHE && !key.startsWith(BOOK_CACHE_PREFIX) && !key.startsWith(LIBRARY_CACHE_PREFIX))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    handleApiRequest(event, request, url);
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
