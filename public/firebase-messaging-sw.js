// Firebase Messaging Service Worker for EduTrack Push Notifications
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: "AIzaSyBmvOscdWMl8Cs9oy0cUSb8fcQRrAo-NAw",
  authDomain: "edutrack-c69ba.firebaseapp.com",
  projectId: "edutrack-c69ba",
  storageBucket: "edutrack-c69ba.firebasestorage.app",
  messagingSenderId: "419803796985",
  appId: "1:419803796985:android:8c55f8070f3cc713df9928"
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload)
  const title = payload.notification?.title || payload.data?.title || 'New Assignment'
  const body = payload.notification?.body || payload.data?.body || 'A new assignment has been posted.'
  const assignmentId = payload.data?.assignment_id || payload.notification?.data?.assignment_id
  const targetUrl = assignmentId ? `/student/assignments/${assignmentId}` : '/student/assignments'

  const options = {
    body: body,
    icon: '/icon-192.png',
    badge: '/favicon.svg',
    tag: `assignment-${assignmentId || Date.now()}`,
    renotify: true,
    data: {
      url: targetUrl,
      assignment_id: assignmentId
    }
  }

  self.registration.showNotification(title, options)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/student/assignments'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
