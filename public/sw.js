// Service Worker für Push Notifications + PWA
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// Push-Event: Benachrichtigung anzeigen
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'QuickHunt'
  const options = {
    body: data.body || 'Neue Nachricht',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'default',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  }

  event.waitUntil(
    self.registration.showNotification(title, options).then(async () => {
      // App-Badge aktualisieren (rote Zahl auf Icon)
      if (self.navigator && self.navigator.setAppBadge) {
        const notifications = await self.registration.getNotifications()
        self.navigator.setAppBadge(notifications.length)
      }
    })
  )
})

// Client-Message: Alle Notifications schließen
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_NOTIFICATIONS') {
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((n) => n.close())
    })
    // Badge auch im SW zurücksetzen
    if (self.navigator && self.navigator.clearAppBadge) {
      self.navigator.clearAppBadge()
    }
  }
})

// Notification-Click: App öffnen/fokussieren
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Bestehendes Fenster wiederverwenden → Cache + React-State bleiben erhalten
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url })
          return client.focus()
        }
      }
      // Kein offenes Fenster → neu öffnen
      return clients.openWindow(url)
    })
  )
})
