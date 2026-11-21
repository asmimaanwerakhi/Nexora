importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

const config = Object.fromEntries(new URLSearchParams(self.location.search));
firebase.initializeApp(config);

const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'New Nexora message';
  const options = {
    body: payload.notification?.body || 'You have a new message.',
    icon: '/favicon.svg',
    data: { url: payload.data?.url || '/' },
    tag: payload.data?.conversationId
      ? `conversation-${payload.data.conversationId}`
      : 'nexora-message',
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).toString();
  event.waitUntil(self.clients.openWindow(target));
});
