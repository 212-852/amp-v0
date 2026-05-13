self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}

  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title =
    typeof payload.title === 'string' && payload.title
      ? payload.title
      : 'PET TAXI'
  const body =
    typeof payload.body === 'string' && payload.body
      ? payload.body
      : 'New message'
  const url =
    typeof payload.url === 'string' && payload.url
      ? payload.url
      : '/'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }

        return self.clients.openWindow(url)
      }),
  )
})
