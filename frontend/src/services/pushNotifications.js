import { getApp, getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { registerPushToken } from './chatApi.js';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const getWorkerRegistration = async () => {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    throw new Error('This browser does not support web push notifications');
  }
  const params = new URLSearchParams(firebaseConfig);
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`);
};

export const enablePushNotifications = async () => {
  const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY;
  if (Object.values(firebaseConfig).some((value) => !value) || !vapidKey) {
    throw new Error('Firebase web push is not configured for this app');
  }
  if (!(await isSupported())) {
    throw new Error('This browser does not support Firebase web push notifications');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted');
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const registration = await getWorkerRegistration();
  const token = await getToken(getMessaging(app), {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) {
    throw new Error('Firebase did not provide a push token');
  }
  await registerPushToken(token);
};
