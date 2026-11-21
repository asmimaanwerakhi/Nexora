import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';

import { getMessaging } from 'firebase-admin/messaging';

const projectId = process.env.FCM_PROJECT_ID;

if (!projectId) {
  throw new Error('FCM_PROJECT_ID is missing in environment variables');
}

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: applicationDefault(),
        projectId,
      });

export const firebaseMessaging = getMessaging(firebaseApp);
