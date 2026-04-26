const CACHE = 'syllabi-v2'
const ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== location.origin) return
  e.respondWith(
    caches.match(request).then((cached) => {
      const fetched = fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {})
          return res
        })
        .catch(() => cached)
      return cached || fetched
    })
  )
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data?.json() || {}
  } catch {
    payload = { title: 'Syllabi', body: event.data?.text() || 'You have a study reminder.' }
  }

  const title = payload.title || 'Syllabi'
  const options = {
    body: payload.body || 'You have a study reminder.',
    tag: payload.tag || 'syllabi-reminder',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {
      route: payload.route || 'dashboard',
      entityId: payload.entityId || '',
      createdAt: payload.createdAt || new Date().toISOString(),
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route = event.notification.data?.route || 'dashboard'
  const entityId = event.notification.data?.entityId || ''
  const url = `/?view=${encodeURIComponent(route)}${entityId ? `&id=${encodeURIComponent(entityId)}` : ''}`

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.postMessage({ type: 'syllabi:navigate', route, params: entityId ? { id: entityId } : {} })
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
