// EduTrack Privacy-Preserving PWA Service Worker
const CACHE_NAME = 'edutrack-static-v3'

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/book-lover-pana.svg',
  '/webinar-pana.svg'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    }).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // STRICT PRIVACY RULE: Never cache Supabase database queries, Auth tokens, or API requests
  if (
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/functions/v1/') ||
    url.pathname.includes('/storage/v1/') ||
    event.request.headers.has('Authorization') ||
    event.request.method !== 'GET'
  ) {
    // Pass directly to network
    return
  }

  // Network-first strategy for static resources
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })
        }
        return networkResponse
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html')
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' })
        })
      })
  )
})

// Web Push Notification Event Listener
self.addEventListener('push', (event) => {
  if (!event.data) return
  try {
    const payload = event.data.json()
    const title = payload.notification?.title || payload.title || 'EduTrack Notification'
    const options = {
      body: payload.notification?.body || payload.body || 'You have a new update on EduTrack.',
      icon: '/icon-192.png',
      badge: '/favicon.svg',
      data: payload.data || { url: '/' }
    }
    event.waitUntil(self.registration.showNotification(title, options))
  } catch (err) {
    const text = event.data.text()
    event.waitUntil(
      self.registration.showNotification('EduTrack Notification', {
        body: text,
        icon: '/icon-192.png',
        badge: '/favicon.svg'
      })
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const urlToOpen = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
      }
    })
  )
})
