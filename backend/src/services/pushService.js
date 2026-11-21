const admin = require('firebase-admin');
const User = require('../models/user');

const getMessaging = () => {
  const projectId = process.env.FCM_PROJECT_ID;
  if (!projectId) {
    throw new Error('FCM_PROJECT_ID is required to send push notifications');
  }
  const app =
    admin.apps[0] ||
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  return admin.messaging(app);
};

const sendMessagePush = async ({ recipientId, conversationId, message }) => {
  const user = await User.findById(recipientId).select('+pushTokens isOnline settings');
  if (!user || user.isOnline || !user.settings?.notificationsEnabled || !user.pushTokens?.length) {
    return;
  }

  const title = message.sender?.name || 'New message';
  const body =
    message.text ||
    { image: 'Photo', video: 'Video', voice: 'Voice message', file: 'File' }[message.type] ||
    'New message';
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const conversationUrl = new URL(`/chat/${conversationId}`, appUrl).toString();
  const result = await getMessaging().sendEachForMulticast({
    tokens: user.pushTokens,
    notification: { title, body: body.slice(0, 120) },
    data: {
      conversationId: conversationId.toString(),
      messageId: message._id.toString(),
      url: new URL(
        `/chat/${conversationId}`,
        process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:5173',
      ).toString(),
    },
    webpush: {
      fcmOptions: { link: conversationUrl },
      notification: { icon: '/favicon.svg', tag: `conversation-${conversationId}` },
    },
  });
  const invalidTokens = result.responses.flatMap((response, index) =>
    response.error &&
    [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
    ].includes(response.error.code)
      ? [user.pushTokens[index]]
      : [],
  );
  if (invalidTokens.length) {
    await User.updateOne({ _id: user._id }, { $pull: { pushTokens: { $in: invalidTokens } } });
  }
};

const sendFriendRequestPush = async ({ recipientId, requester }) => {
  const user = await User.findById(recipientId).select('+pushTokens isOnline settings');
  if (!user || user.isOnline || !user.settings?.notificationsEnabled || !user.pushTokens?.length) {
    return;
  }
  const result = await getMessaging().sendEachForMulticast({
    tokens: user.pushTokens,
    notification: {
      title: 'Friend request',
      body: `${requester.name} sent you a friend request`,
    },
    data: {
      url: new URL(
        '/chat?tab=requests',
        process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:5173',
      ).toString(),
    },
    webpush: {
      fcmOptions: {
        link: new URL(
          '/chat?tab=requests',
          process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:5173',
        ).toString(),
      },
      notification: { icon: '/favicon.svg', tag: 'friend-requests' },
    },
  });
  const invalidTokens = result.responses.flatMap((response, index) =>
    response.error &&
    [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
    ].includes(response.error.code)
      ? [user.pushTokens[index]]
      : [],
  );
  if (invalidTokens.length) {
    await User.updateOne({ _id: user._id }, { $pull: { pushTokens: { $in: invalidTokens } } });
  }
};

const sendMissedCallPush = async ({ recipientId, callerName, type }) => {
  const user = await User.findById(recipientId).select('+pushTokens isOnline settings');
  if (!user || user.isOnline || !user.settings?.notificationsEnabled || !user.pushTokens?.length) {
    return;
  }
  const title = type === 'video' ? 'Missed video call' : 'Missed voice call';
  const body = `${callerName || 'A friend'} tried to call you`;
  const url = new URL(
    '/calls',
    process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:5173',
  ).toString();
  const result = await getMessaging().sendEachForMulticast({
    tokens: user.pushTokens,
    notification: { title, body },
    data: { url },
    webpush: {
      fcmOptions: { link: url },
      notification: { icon: '/favicon.svg', tag: 'missed-calls' },
    },
  });
  const invalidTokens = result.responses.flatMap((response, index) =>
    response.error &&
    [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
    ].includes(response.error.code)
      ? [user.pushTokens[index]]
      : [],
  );
  if (invalidTokens.length) {
    await User.updateOne({ _id: user._id }, { $pull: { pushTokens: { $in: invalidTokens } } });
  }
};

const sendMeetingPush = async ({ recipientId, title, body, meetingLink }) => {
  const user = await User.findById(recipientId).select('+pushTokens isOnline settings');
  if (!user || user.isOnline || !user.settings?.notificationsEnabled || !user.pushTokens?.length) {
    return;
  }
  const url = new URL(
    `/meet/${encodeURIComponent(meetingLink)}`,
    process.env.CLIENT_URL || process.env.APP_URL || 'http://localhost:5173',
  ).toString();
  const result = await getMessaging().sendEachForMulticast({
    tokens: user.pushTokens,
    notification: { title: title.slice(0, 120), body: body.slice(0, 120) },
    data: { meetingLink, url },
    webpush: {
      fcmOptions: { link: url },
      notification: { icon: '/favicon.svg', tag: `meeting-${meetingLink}` },
    },
  });
  const invalidTokens = result.responses.flatMap((response, index) =>
    response.error &&
    [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
    ].includes(response.error.code)
      ? [user.pushTokens[index]]
      : [],
  );
  if (invalidTokens.length) {
    await User.updateOne({ _id: user._id }, { $pull: { pushTokens: { $in: invalidTokens } } });
  }
};

module.exports = {
  sendFriendRequestPush,
  sendMeetingPush,
  sendMessagePush,
  sendMissedCallPush,
};
