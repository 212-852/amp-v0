self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

function sw_debug(event, payload) {
  return fetch('/api/debug/pwa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event,
      source_channel: 'pwa',
      phase: 'service_worker',
      ...payload,
    }),
  }).catch(() => undefined)
}

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
  const data =
    payload.data && typeof payload.data === 'object'
      ? payload.data
      : {}
  const url =
    typeof data.url === 'string' && data.url
      ? data.url
      : typeof payload.url === 'string' && payload.url
        ? payload.url
        : '/'
  const room_uuid =
    typeof data.room_uuid === 'string' ? data.room_uuid : null
  const participant_uuid =
    typeof data.participant_uuid === 'string' ? data.participant_uuid : null
  const message_uuid =
    typeof data.message_uuid === 'string' ? data.message_uuid : null
  const tag =
    typeof payload.tag === 'string' && payload.tag
      ? payload.tag
      : room_uuid || 'new_chat'
  const notification_data = {
    ...data,
    room_uuid,
    participant_uuid,
    message_uuid,
    url,
  }

  event.waitUntil(
    (async () => {
      await sw_debug('sw_push_received', {
        room_uuid,
        participant_uuid,
        message_uuid,
        has_payload: Boolean(event.data),
        tag,
      })

      const client_list = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const focused_or_visible = client_list.some(
        (client) =>
          client.focused === true || client.visibilityState === 'visible',
      )

      if (focused_or_visible) {
        await sw_debug('sw_push_suppressed_focused_client', {
          room_uuid,
          participant_uuid,
          message_uuid,
          tag,
          client_count: client_list.length,
        })

        for (const client of client_list) {
          client.postMessage({
            type: 'push_suppressed_focused_client',
            room_uuid,
            participant_uuid,
            message_uuid,
            url,
          })
        }

        return
      }

      await self.registration.showNotification(title, {
        body,
        icon:
          typeof payload.icon === 'string' && payload.icon
            ? payload.icon
            : '/icons/icon-192.png',
        badge:
          typeof payload.badge === 'string' && payload.badge
            ? payload.badge
            : '/icons/badge.png',
        tag,
        renotify: payload.renotify === true,
        silent: payload.silent === true,
        data: notification_data,
      })

      await sw_debug('sw_notification_shown', {
        room_uuid,
        participant_uuid,
        message_uuid,
        tag,
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data =
    event.notification.data && typeof event.notification.data === 'object'
      ? event.notification.data
      : {}
  const url =
    typeof data.url === 'string' && data.url
      ? data.url
      : '/user'
  const room_uuid =
    typeof data.room_uuid === 'string' ? data.room_uuid : null
  const participant_uuid =
    typeof data.participant_uuid === 'string' ? data.participant_uuid : null
  const message_uuid =
    typeof data.message_uuid === 'string' ? data.message_uuid : null

  event.waitUntil(
    (async () => {
      await sw_debug('sw_notification_clicked', {
        room_uuid,
        participant_uuid,
        message_uuid,
        current_url: url,
      })

      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            await client.navigate(url)
          }

          return client.focus()
        }
      }

      return self.clients.openWindow(url)
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'clear_notifications') {
    return
  }

  event.waitUntil(
    (async () => {
      await sw_debug('sw_notifications_clear_requested', {
        source_channel: 'pwa',
      })

      const notifications = await self.registration.getNotifications()

      for (const notification of notifications) {
        notification.close()
      }

      await sw_debug('sw_notifications_cleared', {
        notification_count: notifications.length,
        source_channel: 'pwa',
      })
    })(),
  )
})
