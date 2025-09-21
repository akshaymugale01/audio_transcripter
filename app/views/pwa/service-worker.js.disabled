// Emergency service worker unregistration script
// This will force unregister any existing service worker and prevent caching issues

const CACHE_NAMES_TO_DELETE = [
  'workbox-precache',
  'workbox-runtime',
  'pwa-cache',
  'assets-cache',
  'static-cache'
];

// Immediately skip waiting and activate
self.addEventListener('install', (event) => {
  console.log('Service worker installing - forcing skipWaiting');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activating - clearing all caches');
  
  event.waitUntil(
    Promise.all([
      // Clear all caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }),
      
      // Claim all clients
      self.clients.claim(),
      
      // Schedule unregistration
      self.registration.unregister().then(() => {
        console.log('Service worker unregistered successfully');
        
        // Force reload all clients
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'FORCE_RELOAD',
              message: 'Service worker cleaned up, reloading...'
            });
          });
        });
      })
    ])
  );
});

// Don't intercept any fetch requests - let everything pass through
self.addEventListener('fetch', (event) => {
  // Completely ignore all fetch events
  return;
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
