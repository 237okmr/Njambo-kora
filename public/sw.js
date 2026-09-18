// Njambo Kora & Njambo Copilote Dual PWA Service Worker - v25170 (Network-First Navigation & Isolated Caches)
const CACHE_GAME = 'njambo-kora-assets-v25179';
const CACHE_COPILOT = 'katika-copilot-assets-v25179';

const GAME_ASSETS = [
  '/',
  '/game/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.svg',
  '/icon-512.svg',
  '/icon-maskable.svg'
];

const COPILOT_ASSETS = [
  '/copilot/',
  '/manifest-copilot.webmanifest',
  '/icon-copilot-192.svg',
  '/icon-copilot-512.svg',
  '/icon-copilot-maskable.svg'
];

function getCacheNameForRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/copilot/') || url.pathname.includes('manifest-copilot') || url.pathname.includes('icon-copilot')) {
      return CACHE_COPILOT;
    }
  } catch (e) {
    // Fallback to default game cache on parse failure
  }
  return CACHE_GAME;
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_GAME).then((cache) => {
        return cache.addAll(GAME_ASSETS).catch((err) => {
          console.warn('Game cache addAll error:', err);
        });
      }),
      caches.open(CACHE_COPILOT).then((cache) => {
        return cache.addAll(COPILOT_ASSETS).catch((err) => {
          console.warn('Copilot cache addAll error:', err);
        });
      })
    ])
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_GAME && key !== CACHE_COPILOT) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  
  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return; // Skip invalid URLs
  }

  // Bypass Firebase / Firestore / Google APIs / Auth / WebSocket / Version endpoint / Vite Dev Server
  if (
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.endsWith('version.json') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.includes('vite') ||
    url.search.includes('v=') ||
    url.search.includes('t=') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    return;
  }

  const targetCacheName = getCacheNameForRequest(event.request);

  // Network-First for HTML navigation: ensures fresh updates load in 1 click when online, with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(targetCacheName).then((cache) => {
              cache.put(event.request, copy);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request, { cacheName: targetCacheName }) || 
                                 await caches.match('/', { cacheName: CACHE_GAME });
          return cachedResponse || new Response('Hors ligne', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // Stale-While-Revalidate for local assets (JS, CSS, SVGs, Fonts)
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request, { cacheName: targetCacheName }).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(targetCacheName).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            return cachedResponse || new Response('Fichier indisponible hors ligne', { status: 503 });
          });

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Network-first for external fonts/styles with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(targetCacheName).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { cacheName: targetCacheName });
        return cached || new Response('Réseau indisponible', { status: 503 });
      })
  );
});

// ==========================================
// Web Push Notifications & Background Alerts
// ==========================================
self.addEventListener('push', (event) => {
  let payload = {
    title: '🃏 Njambo Kora',
    body: 'Nouvelle notification de jeu !',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: 'njambo-notification',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const json = event.data.json();
      payload = { ...payload, ...json };
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const notificationOptions = {
    body: payload.body,
    icon: payload.icon || '/icon-192.svg',
    badge: payload.badge || '/icon-192.svg',
    tag: payload.tag || 'njambo-game-alert',
    data: payload.data || { url: '/' },
    vibrate: [200, 100, 200, 100, 200],
    renotify: true,
    requireInteraction: true,
    actions: payload.data?.roomCode
      ? [
          { action: 'join', title: '🃏 Rejoindre la table' },
          { action: 'dismiss', title: 'Ignorer' },
        ]
      : [],
  };

  const tasks = [
    self.registration.showNotification(payload.title, notificationOptions),
  ];

  // Set App Badge on mobile home screen if supported
  if ('setAppBadge' in self.navigator) {
    tasks.push(self.navigator.setAppBadge().catch(() => {}));
  }

  event.waitUntil(Promise.all(tasks));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Clear App Badge when clicking notification
  if ('clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {});
  }

  if (event.action === 'dismiss') {
    return;
  }

  const notifData = event.notification.data || {};
  let targetUrlStr = notifData.url || '/';
  if (notifData.roomCode) {
    targetUrlStr = `/?join=${notifData.roomCode}`;
  }

  // Resolve absolute URL using registration scope to guarantee precise WebAPK matching
  const absoluteTargetUrl = new URL(targetUrlStr, self.registration.scope).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Find a client window that belongs to our application scope (browser tab or PWA standalone window)
      let matchingClient = null;
      for (const client of clientList) {
        if (client.url && client.url.startsWith(self.registration.scope)) {
          matchingClient = client;
          break;
        }
      }

      if (matchingClient) {
        // If a window is already open (browser tab or standalone PWA), focus it and navigate
        if ('focus' in matchingClient) {
          matchingClient.postMessage({
            type: 'PUSH_NOTIFICATION_CLICKED',
            data: notifData,
          });
          if (notifData.roomCode && 'navigate' in matchingClient) {
            matchingClient.navigate(absoluteTargetUrl);
          }
          return matchingClient.focus();
        }
      }

      // Otherwise, open a new window.
      // Since absoluteTargetUrl is fully qualified within self.registration.scope,
      // mobile Chrome/Android will open it inside the WebAPK (standalone app) if installed,
      // or as a standard browser tab if the app is not installed.
      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteTargetUrl);
      }
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('Notification was closed by user', event.notification.tag);
});
