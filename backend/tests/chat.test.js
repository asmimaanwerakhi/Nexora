process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-for-nexora-chat-tests';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-nexora-chat-tests';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.BCRYPT_SALT_ROUNDS = '10';
jest.setTimeout(30000);

jest.mock('../src/services/emailService', () => ({
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/pushService', () => ({
  sendFriendRequestPush: jest.fn().mockResolvedValue(undefined),
  sendMeetingPush: jest.fn().mockResolvedValue(undefined),
  sendMessagePush: jest.fn().mockResolvedValue(undefined),
  sendMissedCallPush: jest.fn().mockResolvedValue(undefined),
}));

const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const { io: createClient } = require('socket.io-client');
const createApp = require('../src/app');
const createSocketServer = require('../src/sockets');
const Block = require('../src/models/block');
const Call = require('../src/models/call');
const Conversation = require('../src/models/conversation');
const Friendship = require('../src/models/friendship');
const Message = require('../src/models/message');
const Meeting = require('../src/models/meeting');
const MeetingJoinRequest = require('../src/models/meetingJoinRequest');
const Report = require('../src/models/report');
const Story = require('../src/models/story');
const Otp = require('../src/models/otp');
const RefreshSession = require('../src/models/refreshSession');
const User = require('../src/models/user');
const { sendOtpEmail } = require('../src/services/emailService');
const {
  sendFriendRequestPush,
  sendMeetingPush,
  sendMessagePush,
  sendMissedCallPush,
} = require('../src/services/pushService');

const MONGODB_MEMORY_SERVER_VERSION = '7.0.14';
const app = createApp();
app.set('trust proxy', 'loopback');
let mongo;
let httpServer;
let ioServer;
let clients = [];
let signupSequence = 1;

const latestCode = () => sendOtpEmail.mock.calls[sendOtpEmail.mock.calls.length - 1][0].code;

const registerAndLogin = async (email, name) => {
  const testIp = `192.0.2.${signupSequence++}`;
  const signup = await request(app)
    .post('/api/v1/auth/signup')
    .send({
      name,
      email,
      password: 'strong-test-password',
    })
    .set('X-Forwarded-For', testIp);
  expect(signup.status).toBe(201);
  const verification = await request(app)
    .post('/api/v1/auth/verify-otp')
    .set('X-Forwarded-For', testIp)
    .send({ email, code: latestCode() });
  expect(verification.status).toBe(200);
  const login = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', testIp)
    .send({ email, password: 'strong-test-password' });
  expect(login.status).toBe(200);
  return { token: login.body.data.accessToken, userId: login.body.data.user.id };
};

const makeFriends = async (firstId, secondId) => {
  const [pairLow, pairHigh] = [firstId, secondId].sort();
  await Friendship.create({
    requester: firstId,
    recipient: secondId,
    pairLow,
    pairHigh,
    status: 'accepted',
    respondedAt: new Date(),
  });
};

const connectClient = async (token) => {
  const address = httpServer.address();
  const client = createClient(`http://127.0.0.1:${address.port}`, {
    auth: { token },
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
  });
  clients.push(client);
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
    client.connect();
  });
  return client;
};

const waitForEvent = (client, eventName) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(eventName, listener);
      reject(new Error(`${eventName} event timed out`));
    }, 3000);
    const listener = (payload) => {
      clearTimeout(timer);
      client.off(eventName, listener);
      resolve(payload);
    };
    client.on(eventName, listener);
  });

const emitSocketEvent = (client, eventName, payload) =>
  new Promise((resolve, reject) => {
    client.timeout(3000).emit(eventName, payload, (timeoutError, response) => {
      if (timeoutError) {
        reject(timeoutError);
        return;
      }
      resolve(response);
    });
  });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { version: MONGODB_MEMORY_SERVER_VERSION },
  });
  await mongoose.connect(mongo.getUri(), { serverSelectionTimeoutMS: 5000 });
  await Promise.all([
    Block.init(),
    Call.init(),
    Conversation.init(),
    Friendship.init(),
    Message.init(),
    Meeting.init(),
    MeetingJoinRequest.init(),
    Report.init(),
    Story.init(),
    Otp.init(),
    RefreshSession.init(),
    User.init(),
  ]);
});

beforeEach(async () => {
  sendOtpEmail.mockClear();
  sendFriendRequestPush.mockClear();
  sendMeetingPush.mockClear();
  sendMessagePush.mockClear();
  sendMissedCallPush.mockClear();
  await Promise.all([
    Block.deleteMany({}),
    Call.deleteMany({}),
    Conversation.deleteMany({}),
    Friendship.deleteMany({}),
    Message.deleteMany({}),
    Meeting.deleteMany({}),
    MeetingJoinRequest.deleteMany({}),
    Report.deleteMany({}),
    Story.deleteMany({}),
    Otp.deleteMany({}),
    RefreshSession.deleteMany({}),
    User.deleteMany({}),
  ]);
  httpServer = http.createServer(app);
  ioServer = createSocketServer(httpServer);
  app.set('io', ioServer);
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
});

afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  clients = [];
  if (ioServer) {
    await new Promise((resolve) => ioServer.close(resolve));
    ioServer = undefined;
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('direct messaging API and sockets', () => {
  test('supports authorized voice calls, WebRTC signaling, ending, and paginated call history', async () => {
    const caller = await registerAndLogin('calls.caller@example.com', 'Caller');
    const receiver = await registerAndLogin('calls.receiver@example.com', 'Receiver');
    await makeFriends(caller.userId, receiver.userId);
    const receiverSocket = await connectClient(receiver.token);
    const callerSocket = await connectClient(caller.token);
    const incomingCall = waitForEvent(receiverSocket, 'call:invite');
    const inviteResponse = await emitSocketEvent(callerSocket, 'call:invite', {
      recipientId: receiver.userId,
      type: 'voice',
    });

    expect(inviteResponse).toMatchObject({
      data: { type: 'voice', recipient: { id: receiver.userId, name: 'Receiver' } },
    });
    const invitation = await incomingCall;
    expect(invitation).toMatchObject({
      callId: inviteResponse.data.callId,
      type: 'voice',
      caller: { id: caller.userId, name: 'Caller' },
    });

    const acceptedEvent = waitForEvent(callerSocket, 'call:accept');
    const acceptResponse = await emitSocketEvent(receiverSocket, 'call:accept', {
      callId: invitation.callId,
    });
    expect(acceptResponse.data).toMatchObject({ callId: invitation.callId, type: 'voice' });
    await expect(acceptedEvent).resolves.toMatchObject({ callId: invitation.callId });

    const offerEvent = waitForEvent(receiverSocket, 'webrtc:offer');
    const offerResponse = await emitSocketEvent(callerSocket, 'webrtc:offer', {
      callId: invitation.callId,
      description: { type: 'offer', sdp: 'v=0' },
    });
    expect(offerResponse).toEqual({ data: undefined });
    await expect(offerEvent).resolves.toMatchObject({
      callId: invitation.callId,
      description: { type: 'offer', sdp: 'v=0' },
    });

    const endedEvent = waitForEvent(receiverSocket, 'call:end');
    const endResponse = await emitSocketEvent(callerSocket, 'call:end', {
      callId: invitation.callId,
    });
    expect(endResponse.data).toMatchObject({ status: 'ended' });
    await expect(endedEvent).resolves.toMatchObject({ callId: invitation.callId, status: 'ended' });

    const history = await request(app)
      .get('/api/v1/calls')
      .set('Authorization', `Bearer ${caller.token}`);
    expect(history.status).toBe(200);
    expect(history.body.data.calls).toHaveLength(1);
    expect(history.body.data.calls[0]).toMatchObject({
      id: invitation.callId,
      type: 'voice',
      status: 'ended',
      direction: 'dialed',
      peer: { id: receiver.userId, name: 'Receiver' },
    });

    await Block.create({ blocker: receiver.userId, blocked: caller.userId });
    const blockedCall = await emitSocketEvent(callerSocket, 'call:invite', {
      recipientId: receiver.userId,
      type: 'video',
    });
    expect(blockedCall.error.code).toBe('CALL_BLOCKED');
  });

  test('creates groups, tracks member receipts, enforces permissions, and removes access live', async () => {
    const owner = await registerAndLogin('groups.owner@example.com', 'Group Owner');
    const member = await registerAndLogin('groups.member@example.com', 'Group Member');
    const addedMember = await registerAndLogin('groups.added@example.com', 'Added Member');
    await makeFriends(owner.userId, member.userId);
    await makeFriends(owner.userId, addedMember.userId);

    const created = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        type: 'group',
        name: 'Project Crew',
        description: 'Shared project chat',
        participantIds: [member.userId],
      });
    expect(created.status).toBe(201);
    const conversationId = created.body.data.conversation.id;

    const addMemberEvent = await request(app)
      .post(`/api/v1/conversations/${conversationId}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ userId: addedMember.userId });
    expect(addMemberEvent.status).toBe(201);

    const ownerSocket = await connectClient(owner.token);
    const memberSocket = await connectClient(member.token);
    const joinOwner = await emitSocketEvent(ownerSocket, 'chat:join', { conversationId });
    const joinMember = await emitSocketEvent(memberSocket, 'chat:join', { conversationId });
    expect(joinOwner.data.joined).toBe(true);
    expect(joinMember.data.joined).toBe(true);

    const typingStart = waitForEvent(memberSocket, 'typing:start');
    const startedTyping = await emitSocketEvent(ownerSocket, 'typing:start', { conversationId });
    expect(startedTyping.data.typing).toBe(true);
    await expect(typingStart).resolves.toMatchObject({
      conversationId,
      userId: owner.userId,
      name: 'Group Owner',
    });
    const typingStop = waitForEvent(memberSocket, 'typing:stop');
    await emitSocketEvent(ownerSocket, 'typing:stop', { conversationId });
    await expect(typingStop).resolves.toMatchObject({ conversationId, userId: owner.userId });

    const newMessage = waitForEvent(memberSocket, 'message:new');
    const sent = await emitSocketEvent(ownerSocket, 'message:send', {
      conversationId,
      text: 'Welcome to the project group',
    });
    expect(sent.data.message.receipts).toHaveLength(2);
    await expect(newMessage).resolves.toMatchObject({
      conversationId,
      sender: { id: owner.userId, name: 'Group Owner' },
      text: 'Welcome to the project group',
    });

    const seenEvent = waitForEvent(ownerSocket, 'message:seen');
    const seen = await emitSocketEvent(memberSocket, 'message:seen', { conversationId });
    expect(seen.data.count).toBeGreaterThan(0);
    await expect(seenEvent).resolves.toMatchObject({
      conversationId,
      userId: member.userId,
    });
    const history = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(history.body.data.messages[0].receipts).toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: member.userId })]),
    );
    expect(history.body.data.messages.some((message) => message.type === 'system')).toBe(true);

    const permissions = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/permissions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ adminsOnlyMessages: true, adminsOnlyAddMembers: true });
    expect(permissions.status).toBe(200);
    const deniedAdd = await request(app)
      .post(`/api/v1/conversations/${conversationId}/members`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ userId: addedMember.userId });
    expect(deniedAdd.status).toBe(403);
    const deniedInfoEdit = await request(app)
      .patch(`/api/v1/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ name: 'Unauthorized rename' });
    expect(deniedInfoEdit.status).toBe(403);
    const deniedMessage = await emitSocketEvent(memberSocket, 'message:send', {
      conversationId,
      text: 'This must be denied',
    });
    expect(deniedMessage.error.code).toBe('GROUP_MESSAGES_ADMIN_ONLY');

    const removedEvent = waitForEvent(memberSocket, 'group:removed');
    const removed = await request(app)
      .delete(`/api/v1/conversations/${conversationId}/members/${member.userId}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(removed.status).toBe(200);
    await expect(removedEvent).resolves.toMatchObject({ conversationId });
    const deniedHistory = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(deniedHistory.status).toBe(404);

    const muted = await request(app)
      .patch(`/api/v1/conversations/${conversationId}/notifications`)
      .set('Authorization', `Bearer ${addedMember.token}`)
      .send({ muted: true });
    expect(muted.status).toBe(200);
    const conversations = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${addedMember.token}`);
    expect(conversations.body.data.conversations[0]).toMatchObject({
      id: conversationId,
      type: 'group',
      name: 'Project Crew',
      muted: true,
      members: expect.arrayContaining([
        expect.objectContaining({ id: owner.userId, role: 'owner' }),
        expect.objectContaining({ id: addedMember.userId, role: 'member' }),
      ]),
    });
  });

  test('supports username search, friend requests, acceptance, and unfriend without deleting history', async () => {
    const first = await registerAndLogin('friends.first@example.com', 'First Friend');
    const second = await registerAndLogin('friends.second@example.com', 'Second Friend');
    const setFirstUsername = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ username: 'first_friend' });
    const setSecondUsername = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${second.token}`)
      .send({ username: 'second_friend' });
    expect(setFirstUsername.status).toBe(200);
    expect(setSecondUsername.status).toBe(200);

    const search = await request(app)
      .get('/api/v1/users/search')
      .query({ username: '@second_friend' })
      .set('Authorization', `Bearer ${first.token}`);
    expect(search.status).toBe(200);
    expect(search.body.data.users[0]).toMatchObject({
      id: second.userId,
      username: 'second_friend',
      name: 'Second Friend',
    });
    expect(search.body.data.users[0]).not.toHaveProperty('email');
    expect(search.body.data.users[0]).not.toHaveProperty('phone');

    const secondSocket = await connectClient(second.token);
    const friendRequestEvent = waitForEvent(secondSocket, 'friend:request');
    const sent = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    expect(sent.status).toBe(201);
    const requestId = sent.body.data.request.id;
    expect(sendFriendRequestPush.mock.calls[0][0].recipientId.toString()).toBe(second.userId);
    await expect(friendRequestEvent).resolves.toMatchObject({
      user: { id: first.userId, username: 'first_friend' },
    });

    const incoming = await request(app)
      .get('/api/v1/friends/requests')
      .set('Authorization', `Bearer ${second.token}`);
    expect(incoming.body.data.incoming[0]).toMatchObject({
      id: requestId,
      user: { id: first.userId, username: 'first_friend' },
    });
    const firstSocket = await connectClient(first.token);
    const acceptedEvent = waitForEvent(firstSocket, 'friend:accepted');
    const duplicate = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    expect(duplicate.status).toBe(409);

    const accepted = await request(app)
      .post(`/api/v1/friends/requests/${requestId}/accept`)
      .set('Authorization', `Bearer ${second.token}`);
    expect(accepted.status).toBe(200);
    const conversationId = accepted.body.data.conversationId;
    await expect(acceptedEvent).resolves.toMatchObject({
      friendId: second.userId,
      conversationId,
    });
    expect(await Conversation.findById(conversationId)).not.toBeNull();
    const friendList = await request(app)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${first.token}`);
    expect(friendList.body.data.friends).toHaveLength(1);

    const message = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ conversationId, text: 'History stays after unfriend' });
    expect(message.status).toBe(201);
    const removed = await request(app)
      .delete(`/api/v1/friends/${second.userId}`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(removed.status).toBe(200);

    const history = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(history.body.data.messages).toHaveLength(1);
    const blockedSend = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ conversationId, text: 'Cannot send after unfriend' });
    expect(blockedSend.status).toBe(403);
    const conversations = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`);
    expect(conversations.body.data.conversations[0].canSend).toBe(false);
  });

  test('sends live online and offline presence only to accepted friends', async () => {
    const first = await registerAndLogin('presence.first@example.com', 'Presence First');
    const second = await registerAndLogin('presence.second@example.com', 'Presence Second');
    const stranger = await registerAndLogin('presence.stranger@example.com', 'Presence Stranger');
    await makeFriends(first.userId, second.userId);

    const firstSocket = await connectClient(first.token);
    const onlineEvent = waitForEvent(firstSocket, 'presence:update');
    const secondSocket = await connectClient(second.token);
    await expect(onlineEvent).resolves.toMatchObject({
      userId: second.userId,
      online: true,
    });
    const offlineEvent = waitForEvent(firstSocket, 'presence:update');
    secondSocket.disconnect();
    await expect(offlineEvent).resolves.toMatchObject({
      userId: second.userId,
      online: false,
    });

    const strangerSocket = await connectClient(stranger.token);
    const privatePresence = waitForEvent(strangerSocket, 'presence:update');
    const reconnectEvent = waitForEvent(firstSocket, 'presence:update');
    await connectClient(second.token);
    await expect(reconnectEvent).resolves.toMatchObject({
      userId: second.userId,
      online: true,
    });
    await expect(privatePresence).rejects.toThrow('presence:update event timed out');
  });

  test('lists recent friends first only when the recent sort is requested', async () => {
    const owner = await registerAndLogin('friends.owner@example.com', 'Owner');
    const olderFriend = await registerAndLogin('friends.older@example.com', 'Amy Friend');
    const newerFriend = await registerAndLogin('friends.newer@example.com', 'Zoe Friend');

    await makeFriends(owner.userId, olderFriend.userId);
    await makeFriends(owner.userId, newerFriend.userId);

    const [olderPairLow, olderPairHigh] = [owner.userId, olderFriend.userId].sort();
    const [newerPairLow, newerPairHigh] = [owner.userId, newerFriend.userId].sort();
    await Promise.all([
      Friendship.updateOne(
        { pairLow: olderPairLow, pairHigh: olderPairHigh },
        { $set: { respondedAt: new Date('2024-01-01T00:00:00.000Z') } },
      ),
      Friendship.updateOne(
        { pairLow: newerPairLow, pairHigh: newerPairHigh },
        { $set: { respondedAt: new Date('2025-01-01T00:00:00.000Z') } },
      ),
    ]);

    const recent = await request(app)
      .get('/api/v1/friends')
      .query({ sort: 'recent' })
      .set('Authorization', `Bearer ${owner.token}`);
    expect(recent.body.data.friends.map((friend) => friend.id)).toEqual([
      newerFriend.userId,
      olderFriend.userId,
    ]);

    const alphabetical = await request(app)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(alphabetical.body.data.friends.map((friend) => friend.id)).toEqual([
      olderFriend.userId,
      newerFriend.userId,
    ]);
  });

  test('resolves custom and generated public profile slugs while enforcing friend visibility', async () => {
    const owner = await registerAndLogin('profiles.owner@example.com', 'Profile Owner');
    const friend = await registerAndLogin('profiles.friend@example.com', 'Public Friend');
    const stranger = await registerAndLogin('profiles.stranger@example.com', 'Profile Stranger');
    await makeFriends(owner.userId, friend.userId);

    await User.updateOne(
      { _id: friend.userId },
      { $set: { 'privacy.profileVisibility': 'friends' } },
    );
    const friends = await request(app)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${owner.token}`);
    const friendProfile = friends.body.data.friends[0];
    expect(friendProfile.profileSlug).toMatch(/^public-friend-[a-f0-9]{24}$/);

    const generatedProfile = await request(app)
      .get(`/api/v1/users/profile/${friendProfile.profileSlug}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(generatedProfile.status).toBe(200);
    expect(generatedProfile.body.data.user).toMatchObject({
      id: friend.userId,
      profileSlug: friendProfile.profileSlug,
      name: 'Public Friend',
      isFriend: true,
    });
    expect(generatedProfile.body.data.user).not.toHaveProperty('email');
    expect(generatedProfile.body.data.user).not.toHaveProperty('phone');

    const privateProfile = await request(app)
      .get(`/api/v1/users/profile/${friendProfile.profileSlug}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(privateProfile.status).toBe(404);

    await User.updateOne({ _id: friend.userId }, { $set: { username: 'public_friend' } });
    const customProfile = await request(app)
      .get('/api/v1/users/profile/public_friend')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(customProfile.status).toBe(200);
    expect(customProfile.body.data.user.profileSlug).toBe('public_friend');
  });

  test('rejects friend requests and enforces the seven-day cooldown after three rejections', async () => {
    const first = await registerAndLogin('friends.sender@example.com', 'Sender');
    const second = await registerAndLogin('friends.receiver@example.com', 'Receiver');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const sent = await request(app)
        .post('/api/v1/friends/request')
        .set('Authorization', `Bearer ${first.token}`)
        .send({ userId: second.userId });
      expect(sent.status).toBe(201);
      const rejected = await request(app)
        .post(`/api/v1/friends/requests/${sent.body.data.request.id}/reject`)
        .set('Authorization', `Bearer ${second.token}`);
      expect(rejected.status).toBe(200);
    }

    const cooldown = await Friendship.findOne({
      requester: first.userId,
      recipient: second.userId,
    });
    expect(cooldown.rejectionCount).toBe(3);
    expect(cooldown.cooldownUntil.getTime()).toBeGreaterThan(Date.now());
    const denied = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    expect(denied.status).toBe(429);
    expect(denied.body.error.code).toBe('FRIEND_REQUEST_COOLDOWN');
  });

  test('prevents self requests and lets only the requester cancel a pending request', async () => {
    const first = await registerAndLogin('friends.cancel-first@example.com', 'Cancel First');
    const second = await registerAndLogin('friends.cancel-second@example.com', 'Cancel Second');
    const selfRequest = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: first.userId });
    expect(selfRequest.status).toBe(400);

    const sent = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    const requestId = sent.body.data.request.id;
    const recipientCancel = await request(app)
      .delete(`/api/v1/friends/requests/${requestId}`)
      .set('Authorization', `Bearer ${second.token}`);
    expect(recipientCancel.status).toBe(404);
    const senderAccept = await request(app)
      .post(`/api/v1/friends/requests/${requestId}/accept`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(senderAccept.status).toBe(404);

    const cancelled = await request(app)
      .delete(`/api/v1/friends/requests/${requestId}`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(cancelled.status).toBe(200);
    const incoming = await request(app)
      .get('/api/v1/friends/requests')
      .set('Authorization', `Bearer ${second.token}`);
    expect(incoming.body.data.incoming).toHaveLength(0);
    const repeatCancel = await request(app)
      .delete(`/api/v1/friends/requests/${requestId}`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(repeatCancel.status).toBe(404);
  });

  test('prevents friend requests when privacy settings disable them and supports block cleanup', async () => {
    const first = await registerAndLogin('friends.blocker@example.com', 'Blocker');
    const second = await registerAndLogin('friends.blocked@example.com', 'Blocked');
    await User.updateOne(
      { _id: second.userId },
      { $set: { 'privacy.allowFriendRequests': false } },
    );
    const denied = await request(app)
      .post('/api/v1/friends/request')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ userId: second.userId });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FRIEND_REQUESTS_DISABLED');

    await User.updateOne({ _id: second.userId }, { $set: { 'privacy.allowFriendRequests': true } });
    await makeFriends(first.userId, second.userId);
    const blocked = await request(app)
      .post(`/api/v1/friends/${second.userId}/block`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(blocked.status).toBe(200);
    expect(await Friendship.countDocuments({ status: 'accepted' })).toBe(0);
    const visibleFriends = await request(app)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${first.token}`);
    expect(visibleFriends.body.data.friends).toHaveLength(0);
    const blockedUsers = await request(app)
      .get('/api/v1/friends/blocked')
      .set('Authorization', `Bearer ${first.token}`);
    expect(blockedUsers.body.data.blocked).toMatchObject([{ id: second.userId }]);
    const unblocked = await request(app)
      .delete(`/api/v1/friends/${second.userId}/block`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(unblocked.status).toBe(200);
    const blockedAfterRemoval = await request(app)
      .get('/api/v1/friends/blocked')
      .set('Authorization', `Bearer ${first.token}`);
    expect(blockedAfterRemoval.body.data.blocked).toHaveLength(0);
  });

  test('sends idempotent messages, paginates history, and tracks delivered/seen receipts', async () => {
    const first = await registerAndLogin('chat.first@example.com', 'First User');
    const second = await registerAndLogin('chat.second@example.com', 'Second User');
    await makeFriends(first.userId, second.userId);

    const create = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ participantId: second.userId });
    expect(create.status).toBe(200);
    const conversationId = create.body.data.conversation.id;
    const friendList = await request(app)
      .get('/api/v1/friends')
      .set('Authorization', `Bearer ${first.token}`);
    expect(friendList.body.data.friends[0]).toMatchObject({
      id: second.userId,
      name: 'Second User',
    });
    expect(friendList.body.data.friends[0]).not.toHaveProperty('email');
    const restMessage = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({
        conversationId,
        text: 'Delivered after reconnect',
        clientMessageId: 'message-rest-1',
      });
    expect(restMessage.status).toBe(201);
    expect(sendMessagePush).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: second.userId, conversationId }),
    );
    const unreadBeforeJoin = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(unreadBeforeJoin.body.data.conversations[0].unreadCount).toBe(1);

    const secondSocket = await connectClient(second.token);
    const firstSocket = await connectClient(first.token);
    const deliveryEvent = waitForEvent(firstSocket, 'message:delivered');
    const joined = await new Promise((resolve, reject) => {
      secondSocket
        .timeout(3000)
        .emit('chat:join', { conversationId }, (error, response) =>
          error ? reject(error) : resolve(response),
        );
    });
    expect(joined.data.joined).toBe(true);
    await expect(deliveryEvent).resolves.toMatchObject({ count: 1 });
    const deliveredMessage = await Message.findById(restMessage.body.data.message._id);
    expect(deliveredMessage.status).toBe('delivered');
    const unreadAfterDelivery = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(unreadAfterDelivery.body.data.conversations[0].unreadCount).toBe(1);

    const incoming = waitForEvent(secondSocket, 'message:new');
    const messageResponse = await new Promise((resolve, reject) => {
      firstSocket.timeout(3000).emit(
        'message:send',
        {
          conversationId,
          text: 'Hello from Nexora',
          replyTo: restMessage.body.data.message._id,
          clientMessageId: 'message-first-1',
        },
        (error, response) => (error ? reject(error) : resolve(response)),
      );
    });
    expect(messageResponse.data.message).toMatchObject({
      text: 'Hello from Nexora',
      status: 'sent',
    });
    expect(messageResponse.data.message.replyTo.id).toBe(restMessage.body.data.message._id);
    await expect(incoming).resolves.toMatchObject({
      text: 'Hello from Nexora',
      conversationId,
    });

    const duplicate = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({
        conversationId,
        text: 'Hello from Nexora',
        clientMessageId: 'message-first-1',
      });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.message._id).toBe(messageResponse.data.message._id);

    const seenEvent = waitForEvent(firstSocket, 'message:seen');
    const seen = await new Promise((resolve, reject) => {
      secondSocket
        .timeout(3000)
        .emit('message:seen', { conversationId }, (error, response) =>
          error ? reject(error) : resolve(response),
        );
    });
    expect(seen.data.count).toBe(2);
    await expect(seenEvent).resolves.toMatchObject({ count: 2 });
    const stored = await Message.findById(messageResponse.data.message._id);
    expect(stored.status).toBe('seen');
    const deliveredThenSeen = await Message.findById(restMessage.body.data.message._id);
    expect(deliveredThenSeen.status).toBe('seen');

    const conversation = await Conversation.findById(conversationId);
    const recipient = conversation.participants.find(
      (participant) => participant.userId.toString() === second.userId,
    );
    expect(recipient.unreadCount).toBe(0);

    const inserted = Array.from({ length: 35 }, (_, index) => ({
      conversationId,
      sender: first.userId,
      type: 'text',
      text: `History ${index}`,
      status: 'sent',
      receipts: [{ userId: second.userId }],
      createdAt: new Date(Date.now() - (35 - index) * 1000),
    }));
    await Message.insertMany(inserted);
    const firstPage = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${first.token}`);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.messages).toHaveLength(30);
    expect(firstPage.body.data.hasMore).toBe(true);
    const olderPage = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .query({ cursor: firstPage.body.data.nextCursor })
      .set('Authorization', `Bearer ${first.token}`);
    expect(olderPage.status).toBe(200);
    expect(olderPage.body.data.messages).toHaveLength(7);
    expect(olderPage.body.data.hasMore).toBe(false);
    expect(new Date(olderPage.body.data.messages[5].createdAt).getTime()).toBeLessThan(
      new Date(firstPage.body.data.messages[0].createdAt).getTime(),
    );
  });

  test('enforces friendship and block restrictions and supports message delete scopes', async () => {
    const first = await registerAndLogin('chat.owner@example.com', 'Owner');
    const second = await registerAndLogin('chat.friend@example.com', 'Friend');
    const denied = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ participantId: second.userId });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FRIENDSHIP_REQUIRED');

    await makeFriends(first.userId, second.userId);
    const create = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ participantId: second.userId });
    const conversationId = create.body.data.conversation.id;
    const message = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ conversationId, text: 'Delete this message' });
    const messageId = message.body.data.message._id;

    const forbiddenDelete = await request(app)
      .delete(`/api/v1/messages/${messageId}`)
      .query({ for: 'all' })
      .set('Authorization', `Bearer ${second.token}`);
    expect(forbiddenDelete.status).toBe(403);

    const deleteForMe = await request(app)
      .delete(`/api/v1/messages/${messageId}`)
      .query({ for: 'me' })
      .set('Authorization', `Bearer ${second.token}`);
    expect(deleteForMe.status).toBe(200);
    let friendConversations = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(friendConversations.body.data.conversations[0].unreadCount).toBe(0);

    const unreadMessage = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ conversationId, text: 'Remove for everyone', clientMessageId: 'delete-everyone-1' });
    const unreadMessageId = unreadMessage.body.data.message._id;
    friendConversations = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(friendConversations.body.data.conversations[0].unreadCount).toBe(1);

    const deleteForAll = await request(app)
      .delete(`/api/v1/messages/${unreadMessageId}`)
      .query({ for: 'all' })
      .set('Authorization', `Bearer ${first.token}`);
    expect(deleteForAll.status).toBe(200);
    expect(deleteForAll.body.data.message).toMatchObject({
      deletedForAll: true,
      text: '',
    });
    friendConversations = await request(app)
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${second.token}`);
    expect(friendConversations.body.data.conversations[0].unreadCount).toBe(0);

    await Block.create({ blocker: first.userId, blocked: second.userId });
    const blockedHistory = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${second.token}`);
    expect(blockedHistory.status).toBe(403);
    expect(blockedHistory.body.error.code).toBe('CHAT_BLOCKED');
  });

  test('rejects invalid media signatures before sending files to storage', async () => {
    const first = await registerAndLogin('chat.upload@example.com', 'Uploader');
    const second = await registerAndLogin('chat.receiver@example.com', 'Receiver');
    await makeFriends(first.userId, second.userId);
    const create = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${first.token}`)
      .send({ participantId: second.userId });
    const response = await request(app)
      .post('/api/v1/messages/upload')
      .set('Authorization', `Bearer ${first.token}`)
      .field('conversationId', create.body.data.conversation.id)
      .attach('file', Buffer.from('not an image'), {
        filename: 'invalid.png',
        contentType: 'image/png',
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_MEDIA_FILE');
  });

  test('stores push tokens privately and allows clients to remove them', async () => {
    const user = await registerAndLogin('chat.push@example.com', 'Push User');
    const token = 'firebase-web-registration-token';
    const registered = await request(app)
      .post('/api/v1/users/me/push-token')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ token });
    expect(registered.status).toBe(200);
    const stored = await User.findById(user.userId).select('+pushTokens');
    expect(stored.pushTokens).toContain(token);

    const profile = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${user.token}`);
    expect(profile.body.data.user).not.toHaveProperty('pushTokens');

    const removed = await request(app)
      .delete('/api/v1/users/me/push-token')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ token });
    expect(removed.status).toBe(200);
    const afterRemoval = await User.findById(user.userId).select('+pushTokens');
    expect(afterRemoval.pushTokens).not.toContain(token);
  });

  test('schedules meetings, gates link requests, tracks decisions, and enforces rejection limits', async () => {
    const host = await registerAndLogin('meeting.host@example.com', 'Meeting Host');
    const invitee = await registerAndLogin('meeting.invited@example.com', 'Meeting Invitee');
    const requester = await registerAndLogin('meeting.requester@example.com', 'Meeting Requester');
    const acceptedRequester = await registerAndLogin(
      'meeting.accepted@example.com',
      'Accepted Requester',
    );
    const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const createMeeting = async (values) =>
      request(app)
        .post('/api/v1/meetings')
        .set('Authorization', `Bearer ${host.token}`)
        .send({
          title: 'Planning session',
          description: 'Project planning',
          startTime,
          durationMinutes: 45,
          timezone: 'UTC',
          allowEarlyJoin: true,
          earlyJoinMinutes: 10,
          ...values,
        });

    const linkMeetingResponse = await createMeeting({
      accessType: 'link',
      allowLinkRequests: true,
    });
    expect(linkMeetingResponse.status).toBe(201);
    const linkMeeting = linkMeetingResponse.body.data.meeting;
    expect(linkMeeting.meetingLink).toMatch(/^[a-zA-Z0-9_-]{10}$/);
    expect(linkMeeting.url).toContain(`/meet/${linkMeeting.meetingLink}`);

    const hostSocket = await connectClient(host.token);
    const requesterSocket = await connectClient(requester.token);
    const acceptedRequesterSocket = await connectClient(acceptedRequester.token);
    const inviteeSocket = await connectClient(invitee.token);
    const privateStatus = await request(app)
      .get(`/api/v1/meetings/link/${linkMeeting.meetingLink}`)
      .set('Authorization', `Bearer ${requester.token}`);
    expect(privateStatus.body.data.meeting.accessStatus).toBe('request_required');

    let activeRequestId;
    for (let rejectionCount = 1; rejectionCount <= 3; rejectionCount += 1) {
      const requestEvent = waitForEvent(hostSocket, 'meeting:join-request');
      const sentRequest = await request(app)
        .post(`/api/v1/meetings/${linkMeeting.id}/request`)
        .set('Authorization', `Bearer ${requester.token}`)
        .send({});
      expect(sentRequest.status).toBe(201);
      const hostNotification = await requestEvent;
      activeRequestId = hostNotification.request.id;
      expect(hostNotification.request.user.id).toBe(requester.userId);

      const pendingAgain = await request(app)
        .post(`/api/v1/meetings/${linkMeeting.id}/request`)
        .set('Authorization', `Bearer ${requester.token}`)
        .send({});
      expect(pendingAgain.status).toBe(409);

      const decisionEvent = waitForEvent(requesterSocket, 'meeting:request-decision');
      const decision = await request(app)
        .post(`/api/v1/meetings/${linkMeeting.id}/requests/${activeRequestId}/decision`)
        .set('Authorization', `Bearer ${host.token}`)
        .send({ decision: 'rejected' });
      expect(decision.status).toBe(200);
      expect(decision.body.data.rejectionCount).toBe(rejectionCount);
      await expect(decisionEvent).resolves.toMatchObject({
        meetingId: linkMeeting.id,
        status: 'rejected',
      });
    }

    const blockedRequest = await request(app)
      .post(`/api/v1/meetings/${linkMeeting.id}/request`)
      .set('Authorization', `Bearer ${requester.token}`)
      .send({});
    expect(blockedRequest.status).toBe(429);
    expect(blockedRequest.body.error.code).toBe('JOIN_REQUEST_BLOCKED');

    const acceptanceRequestEvent = waitForEvent(hostSocket, 'meeting:join-request');
    const acceptedRequest = await request(app)
      .post(`/api/v1/meetings/${linkMeeting.id}/request`)
      .set('Authorization', `Bearer ${acceptedRequester.token}`)
      .send({});
    expect(acceptedRequest.status).toBe(201);
    const acceptanceRequest = await acceptanceRequestEvent;
    const acceptedEvent = waitForEvent(acceptedRequesterSocket, 'meeting:request-decision');
    const decision = await request(app)
      .post(`/api/v1/meetings/${linkMeeting.id}/requests/${acceptanceRequest.request.id}/decision`)
      .set('Authorization', `Bearer ${host.token}`)
      .send({ decision: 'accepted' });
    expect(decision.status).toBe(200);
    await expect(acceptedEvent).resolves.toMatchObject({
      meetingId: linkMeeting.id,
      status: 'accepted',
    });
    const acceptedAccess = await request(app)
      .get(`/api/v1/meetings/link/${linkMeeting.meetingLink}`)
      .set('Authorization', `Bearer ${acceptedRequester.token}`);
    expect(acceptedAccess.body.data.meeting).toMatchObject({
      accessStatus: 'waiting',
      request: { status: 'accepted' },
    });
    const earlyToken = await request(app)
      .post(`/api/v1/meetings/${linkMeeting.id}/token`)
      .set('Authorization', `Bearer ${acceptedRequester.token}`);
    expect(earlyToken.status).toBe(409);
    expect(earlyToken.body.error.code).toBe('MEETING_NOT_STARTED');

    const updatedStart = await request(app)
      .patch(`/api/v1/meetings/${linkMeeting.id}`)
      .set('Authorization', `Bearer ${host.token}`)
      .send({ startTime: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
    expect(updatedStart.status).toBe(200);
    const unjoinedHand = await emitSocketEvent(acceptedRequesterSocket, 'meeting:raise-hand', {
      meetingId: linkMeeting.id,
    });
    expect(unjoinedHand.error.code).toBe('MEETING_ROOM_REQUIRED');
    const removed = await request(app)
      .delete(`/api/v1/meetings/${linkMeeting.id}/participants/${acceptedRequester.userId}`)
      .set('Authorization', `Bearer ${host.token}`);
    expect(removed.status).toBe(200);
    const removedAccess = await request(app)
      .get(`/api/v1/meetings/link/${linkMeeting.meetingLink}`)
      .set('Authorization', `Bearer ${acceptedRequester.token}`);
    expect(removedAccess.body.data.meeting.accessStatus).toBe('removed');
    const removedToken = await request(app)
      .post(`/api/v1/meetings/${linkMeeting.id}/token`)
      .set('Authorization', `Bearer ${acceptedRequester.token}`);
    expect(removedToken.status).toBe(403);

    const pendingEvent = waitForEvent(hostSocket, 'meeting:join-request');
    const pendingRequest = await request(app)
      .post(`/api/v1/meetings/${linkMeeting.id}/request`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .send({});
    expect(pendingRequest.status).toBe(201);
    const pendingNotification = await pendingEvent;
    const cancelledRequestEvent = waitForEvent(inviteeSocket, 'meeting:request-decision');
    const disabledRequests = await request(app)
      .patch(`/api/v1/meetings/${linkMeeting.id}`)
      .set('Authorization', `Bearer ${host.token}`)
      .send({ allowLinkRequests: false });
    expect(disabledRequests.status).toBe(200);
    await expect(cancelledRequestEvent).resolves.toMatchObject({
      meetingId: linkMeeting.id,
      status: 'cancelled',
    });
    const cancelledRequest = await MeetingJoinRequest.findById(pendingNotification.request.id);
    expect(cancelledRequest.status).toBe('cancelled');

    const restrictedResponse = await createMeeting({
      accessType: 'restricted',
      invitedUsers: [invitee.userId],
    });
    expect(restrictedResponse.status).toBe(201);
    const restrictedMeeting = restrictedResponse.body.data.meeting;
    const inviteeAccess = await request(app)
      .get(`/api/v1/meetings/link/${restrictedMeeting.meetingLink}`)
      .set('Authorization', `Bearer ${invitee.token}`);
    expect(inviteeAccess.body.data.meeting.accessStatus).toBe('waiting');
    const outsiderAccess = await request(app)
      .get(`/api/v1/meetings/link/${restrictedMeeting.meetingLink}`)
      .set('Authorization', `Bearer ${requester.token}`);
    expect(outsiderAccess.body.data.meeting.accessStatus).toBe('private');
    const deniedRequest = await request(app)
      .post(`/api/v1/meetings/${restrictedMeeting.id}/request`)
      .set('Authorization', `Bearer ${requester.token}`)
      .send({});
    expect(deniedRequest.status).toBe(403);

    const edited = await request(app)
      .patch(`/api/v1/meetings/${restrictedMeeting.id}`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .send({ title: 'Unauthorized edit' });
    expect(edited.status).toBe(403);
    const rescheduled = await request(app)
      .patch(`/api/v1/meetings/${restrictedMeeting.id}`)
      .set('Authorization', `Bearer ${host.token}`)
      .send({ startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() });
    expect(rescheduled.status).toBe(200);

    const cancelled = await request(app)
      .delete(`/api/v1/meetings/${restrictedMeeting.id}`)
      .set('Authorization', `Bearer ${host.token}`);
    expect(cancelled.status).toBe(200);
    const closedAccess = await request(app)
      .get(`/api/v1/meetings/link/${restrictedMeeting.meetingLink}`)
      .set('Authorization', `Bearer ${invitee.token}`);
    expect(closedAccess.body.data.meeting.accessStatus).toBe('ended');
  });

  test('supports message actions, privacy controls, reports, and friend-only story views', async () => {
    const alice = await registerAndLogin('phase6.alice@example.com', 'Alice');
    const bob = await registerAndLogin('phase6.bob@example.com', 'Bob');
    const outsider = await registerAndLogin('phase6.outsider@example.com', 'Outsider');
    await makeFriends(alice.userId, bob.userId);
    await makeFriends(bob.userId, outsider.userId);

    const sourceConversation = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ participantId: bob.userId });
    const targetConversation = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ participantId: outsider.userId });
    const original = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        conversationId: sourceConversation.body.data.conversation.id,
        text: 'Phase six searchable message',
      });
    const messageId = original.body.data.message._id;

    const edited = await request(app)
      .patch(`/api/v1/messages/${messageId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ text: 'Phase six edited searchable message' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.message.editedAt).toBeTruthy();

    const reaction = await request(app)
      .post(`/api/v1/messages/${messageId}/reaction`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ emoji: '👍' });
    expect(reaction.body.data.message.reactions).toHaveLength(1);
    expect(reaction.body.data.message.reactions[0].emoji).toBe('👍');

    const search = await request(app)
      .get(`/api/v1/conversations/${sourceConversation.body.data.conversation.id}/messages/search`)
      .query({ q: 'edited searchable' })
      .set('Authorization', `Bearer ${bob.token}`);
    expect(search.status).toBe(200);
    expect(search.body.data.messages.map((message) => message._id)).toContain(messageId);

    const starred = await request(app)
      .post(`/api/v1/messages/${messageId}/star`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(starred.body.data.starred).toBe(true);
    const starredList = await request(app)
      .get('/api/v1/messages/starred')
      .set('Authorization', `Bearer ${bob.token}`);
    expect(starredList.body.data.messages.map((message) => message._id)).toContain(messageId);

    const pins = await request(app)
      .post(
        `/api/v1/conversations/${sourceConversation.body.data.conversation.id}/pins/${messageId}`,
      )
      .set('Authorization', `Bearer ${bob.token}`);
    expect(pins.status).toBe(200);
    expect(pins.body.data.messages.map((message) => message._id)).toContain(messageId);

    const forwarded = await request(app)
      .post(`/api/v1/messages/${messageId}/forward`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ conversationId: targetConversation.body.data.conversation.id });
    expect(forwarded.status).toBe(201);
    expect(forwarded.body.data.message).toMatchObject({
      text: 'Phase six edited searchable message',
      forwarded: true,
    });

    const report = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${bob.token}`)
      .send({
        reportedUserId: alice.userId,
        messageId,
        reason: 'harassment',
        details: 'Test report',
      });
    expect(report.status).toBe(201);
    const myReports = await request(app)
      .get('/api/v1/reports/mine')
      .set('Authorization', `Bearer ${bob.token}`);
    expect(myReports.body.data.reports).toHaveLength(1);
    const previousAdminIds = process.env.REPORT_ADMIN_USER_IDS;
    let reviewQueue;
    try {
      process.env.REPORT_ADMIN_USER_IDS = bob.userId;
      reviewQueue = await request(app)
        .get('/api/v1/reports/admin')
        .set('Authorization', `Bearer ${bob.token}`);
    } finally {
      if (previousAdminIds === undefined) delete process.env.REPORT_ADMIN_USER_IDS;
      else process.env.REPORT_ADMIN_USER_IDS = previousAdminIds;
    }
    expect(reviewQueue.body.data.reports).toHaveLength(1);

    const privacy = await request(app)
      .patch('/api/v1/users/me/preferences')
      .set('Authorization', `Bearer ${bob.token}`)
      .send({
        privacy: { callPermission: 'nobody', readReceipts: false },
        settings: { theme: 'dark' },
      });
    expect(privacy.status).toBe(200);
    expect(privacy.body.data.user.privacy.callPermission).toBe('nobody');
    expect(privacy.body.data.user.settings.theme).toBe('dark');
    const { markSeen } = require('../src/services/chatService');
    const hiddenReceipt = await markSeen(bob.userId, sourceConversation.body.data.conversation.id);
    expect(hiddenReceipt).toMatchObject({ count: 0, readReceiptsDisabled: true });

    const callService = require('../src/services/callService');
    const caller = await User.findById(alice.userId);
    await expect(
      callService.inviteCall(ioServer, caller, bob.userId, 'voice'),
    ).rejects.toMatchObject({ code: 'CALLS_DISABLED' });

    const story = await Story.create({
      userId: alice.userId,
      mediaUrl: 'https://res.cloudinary.com/test/story.jpg',
      mediaType: 'image',
      caption: 'Friends-only story',
    });
    const friendFeed = await request(app)
      .get('/api/v1/stories')
      .set('Authorization', `Bearer ${bob.token}`);
    expect(friendFeed.body.data.stories.map((item) => item.id)).toContain(story._id.toString());
    const outsiderFeed = await request(app)
      .get('/api/v1/stories')
      .set('Authorization', `Bearer ${alice.token}`);
    expect(outsiderFeed.body.data.stories).toHaveLength(1);
    const viewed = await request(app)
      .post(`/api/v1/stories/${story._id}/view`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(viewed.status).toBe(200);
    const storedStory = await Story.findById(story._id);
    expect(storedStory.viewers.map((viewer) => viewer.userId.toString())).toContain(bob.userId);
  });
});
