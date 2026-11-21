const { createHmac } = require('node:crypto');
const mongoose = require('mongoose');
const Block = require('../models/block');
const Call = require('../models/call');
const Friendship = require('../models/friendship');
const User = require('../models/user');
const AppError = require('../utils/AppError');

const activeCalls = new Map();
const callTimers = new Map();
const RING_TIMEOUT_MS = 30_000;

const callError = (statusCode, code, message) => new AppError(statusCode, code, message);
const pairFor = (firstId, secondId) => [firstId.toString(), secondId.toString()].sort();

const ensureCallRelationship = async (callerId, receiverId, privacy) => {
  const [pairLow, pairHigh] = pairFor(callerId, receiverId);
  const [friendship, block] = await Promise.all([
    Friendship.exists({ pairLow, pairHigh, status: 'accepted' }),
    Block.exists({
      $or: [
        { blocker: callerId, blocked: receiverId },
        { blocker: receiverId, blocked: callerId },
      ],
    }),
  ]);
  if (block) throw callError(403, 'CALL_BLOCKED', 'Calls are unavailable for this user');
  if (privacy?.callPermission === 'nobody') {
    throw callError(403, 'CALLS_DISABLED', 'This user is not accepting calls');
  }
  if (privacy?.callPermission !== 'everyone' && !friendship)
    throw callError(403, 'FRIENDSHIP_REQUIRED', 'You can only call an accepted friend');
};

const getIceServers = (userId) => {
  const iceServers = [{ urls: process.env.CALL_STUN_URL || 'stun:stun.l.google.com:19302' }];
  const turnUrls = (process.env.CALL_TURN_URLS || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  if (turnUrls.length) {
    let username;
    let credential;
    if (process.env.CALL_TURN_SHARED_SECRET) {
      username = `${Math.floor(Date.now() / 1000) + 3600}:${userId.toString()}`;
      credential = createHmac('sha1', process.env.CALL_TURN_SHARED_SECRET)
        .update(username)
        .digest('base64');
    } else if (process.env.CALL_TURN_USERNAME && process.env.CALL_TURN_CREDENTIAL) {
      username = process.env.CALL_TURN_USERNAME;
      credential = process.env.CALL_TURN_CREDENTIAL;
    } else {
      throw callError(
        500,
        'TURN_CONFIG_INVALID',
        'TURN server URLs are configured without valid TURN credentials',
      );
    }
    iceServers.push({ urls: turnUrls, username, credential });
  }
  return iceServers;
};

const releaseCall = (call) => {
  const callId = call._id.toString();
  const participantIds = [call.caller, call.receiver].map((participant) =>
    participant._id ? participant._id.toString() : participant.toString(),
  );
  for (const participantId of participantIds) {
    if (activeCalls.get(participantId) === callId) activeCalls.delete(participantId);
  }
  const timer = callTimers.get(callId);
  if (timer) clearTimeout(timer);
  callTimers.delete(callId);
};

const scheduleMissedCall = (io, callId) => {
  const timer = setTimeout(async () => {
    try {
      const call = await Call.findOneAndUpdate(
        { _id: callId, status: 'ringing' },
        { $set: { status: 'missed', endedAt: new Date(), durationSeconds: 0 } },
        { new: true },
      ).populate('caller receiver', 'name');
      if (!call) return;
      releaseCall(call);
      const payload = {
        callId: call._id.toString(),
        status: 'missed',
        callerId: call.caller._id.toString(),
        receiverId: call.receiver._id.toString(),
      };
      io.to(`user:${payload.callerId}`).emit('call:missed', payload);
      io.to(`user:${payload.receiverId}`).emit('call:missed', payload);
      const { sendMissedCallPush } = require('./pushService');
      void sendMissedCallPush({
        recipientId: call.receiver._id,
        callerName: call.caller.name,
        type: call.type,
      }).catch((error) => console.error('Could not send missed call push notification', error));
    } catch (error) {
      console.error('Could not mark unanswered call as missed', error);
    }
  }, RING_TIMEOUT_MS);
  timer.unref?.();
  callTimers.set(callId, timer);
};

const inviteCall = async (io, caller, recipientId, type) => {
  const callerId = caller._id.toString();
  if (!mongoose.isValidObjectId(recipientId) || callerId === recipientId) {
    throw callError(400, 'INVALID_CALL_RECIPIENT', 'Choose another valid user');
  }
  const recipient = await User.findById(recipientId).select('name avatar privacy');
  if (!recipient) throw callError(404, 'USER_NOT_FOUND', 'User not found');
  await ensureCallRelationship(caller._id, recipientId, recipient.privacy);
  const recipientSockets = await io.in(`user:${recipientId}`).fetchSockets();
  if (!recipientSockets.length) throw callError(409, 'USER_OFFLINE', 'This user is offline');
  if (activeCalls.has(callerId)) throw callError(409, 'CALLER_BUSY', 'You are already in a call');
  if (activeCalls.has(recipientId)) throw callError(409, 'USER_BUSY', 'This user is busy');

  const reservationId = `reserved:${new mongoose.Types.ObjectId()}`;
  activeCalls.set(callerId, reservationId);
  activeCalls.set(recipientId, reservationId);
  let call;
  try {
    call = await Call.create({ caller: caller._id, receiver: recipient._id, type });
    const callId = call._id.toString();
    activeCalls.set(callerId, callId);
    activeCalls.set(recipientId, callId);
    scheduleMissedCall(io, call._id.toString());
  } catch (error) {
    if (activeCalls.get(callerId) === reservationId) activeCalls.delete(callerId);
    if (activeCalls.get(recipientId) === reservationId) activeCalls.delete(recipientId);
    throw error;
  }

  const callId = call._id.toString();
  const incoming = {
    callId,
    type,
    caller: { id: callerId, name: caller.name, avatar: caller.avatar },
  };
  io.to(`user:${recipientId}`).emit('call:invite', incoming);
  io.to(`user:${callerId}`).emit('call:ringing', {
    callId,
    type,
    recipient: { id: recipientId, name: recipient.name, avatar: recipient.avatar },
  });
  return {
    callId,
    type,
    recipient: { id: recipientId, name: recipient.name, avatar: recipient.avatar },
  };
};

const acceptCall = async (io, userId, callId) => {
  if (!mongoose.isValidObjectId(callId)) {
    throw callError(400, 'INVALID_CALL_ID', 'The call ID is invalid');
  }
  const receiverIceServers = getIceServers(userId);
  const call = await Call.findOneAndUpdate(
    { _id: callId, receiver: userId, status: 'ringing' },
    { $set: { status: 'answered', startedAt: new Date() } },
    { new: true },
  ).populate('caller receiver', 'name avatar');
  if (!call) throw callError(404, 'CALL_NOT_FOUND', 'This call is no longer available');
  releaseCall(call);
  activeCalls.set(call.caller._id.toString(), call._id.toString());
  activeCalls.set(call.receiver._id.toString(), call._id.toString());
  const payload = {
    callId: call._id.toString(),
    type: call.type,
    caller: { id: call.caller._id.toString(), name: call.caller.name, avatar: call.caller.avatar },
    receiver: {
      id: call.receiver._id.toString(),
      name: call.receiver.name,
      avatar: call.receiver.avatar,
    },
  };
  const receiverPayload = { ...payload, iceServers: receiverIceServers };
  io.to(`user:${call.caller._id}`).emit('call:accept', {
    ...payload,
    iceServers: getIceServers(call.caller._id),
  });
  io.to(`user:${call.receiver._id}`).emit('call:accept', receiverPayload);
  return receiverPayload;
};

const finishCall = async (io, userId, callId, status) => {
  if (!mongoose.isValidObjectId(callId)) {
    throw callError(400, 'INVALID_CALL_ID', 'The call ID is invalid');
  }
  const validStatus = status === 'rejected' ? 'ringing' : { $in: ['ringing', 'answered'] };
  const call = await Call.findOneAndUpdate(
    {
      _id: callId,
      status: validStatus,
      ...(status === 'rejected'
        ? { receiver: userId }
        : { $or: [{ caller: userId }, { receiver: userId }] }),
    },
    { $set: { status, endedAt: new Date() } },
    { new: true },
  );
  if (!call) throw callError(404, 'CALL_NOT_FOUND', 'This call is no longer active');
  if (call.startedAt) {
    call.durationSeconds = Math.max(0, Math.floor((call.endedAt - call.startedAt) / 1000));
    await call.save();
  }
  releaseCall(call);
  const payload = {
    callId: call._id.toString(),
    status: call.status,
    durationSeconds: call.durationSeconds,
    endedBy: userId.toString(),
  };
  const event = status === 'rejected' ? 'call:reject' : 'call:end';
  io.to(`user:${call.caller}`).emit(event, payload);
  io.to(`user:${call.receiver}`).emit(event, payload);
  return payload;
};

const relaySignal = async (io, userId, callId, event, data) => {
  if (!mongoose.isValidObjectId(callId)) {
    throw callError(400, 'INVALID_CALL_ID', 'The call ID is invalid');
  }
  const call = await Call.findOne({
    _id: callId,
    status: 'answered',
    $or: [{ caller: userId }, { receiver: userId }],
  }).select('caller receiver');
  if (!call) throw callError(403, 'CALL_NOT_ACTIVE', 'This call is not active');
  const recipientId =
    call.caller.toString() === userId.toString()
      ? call.receiver.toString()
      : call.caller.toString();
  io.to(`user:${recipientId}`).emit(event, {
    callId,
    [event === 'webrtc:ice' ? 'candidate' : 'description']: data,
  });
};

const endActiveCallForUser = async (io, userId) => {
  const callId = activeCalls.get(userId.toString());
  if (!callId || callId.startsWith('reserved:')) return;
  try {
    await finishCall(io, userId, callId, 'ended');
  } catch (error) {
    if (error.code !== 'CALL_NOT_FOUND') {
      console.error('Could not end call after participant disconnected', error);
    }
  }
};

const listCallHistory = async (userId, cursor) => {
  const query = { $or: [{ caller: userId }, { receiver: userId }] };
  if (cursor) {
    if (!mongoose.isValidObjectId(cursor)) {
      throw callError(400, 'INVALID_CURSOR', 'The call history cursor is invalid');
    }
    const cursorCall = await Call.findOne({
      _id: cursor,
      $or: [{ caller: userId }, { receiver: userId }],
    }).select('createdAt');
    if (!cursorCall) throw callError(400, 'INVALID_CURSOR', 'The call history cursor is invalid');
    query.$or = [
      { createdAt: { $lt: cursorCall.createdAt } },
      { createdAt: cursorCall.createdAt, _id: { $lt: cursorCall._id } },
    ];
    query.$and = [{ $or: [{ caller: userId }, { receiver: userId }] }];
  }
  const documents = await Call.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(21)
    .populate('caller receiver', 'name avatar');
  const hasMore = documents.length > 20;
  const calls = documents.slice(0, 20).map((call) => {
    const caller = call.caller;
    const receiver = call.receiver;
    const ownCall = caller._id.toString() === userId.toString();
    const other = ownCall ? receiver : caller;
    return {
      id: call._id.toString(),
      type: call.type,
      status: call.status,
      direction: ownCall ? 'dialed' : call.status === 'missed' ? 'missed' : 'received',
      peer: { id: other._id.toString(), name: other.name, avatar: other.avatar },
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      durationSeconds: call.durationSeconds,
      createdAt: call.createdAt,
    };
  });
  return {
    calls,
    hasMore,
    nextCursor: hasMore ? calls[calls.length - 1].id : null,
  };
};

module.exports = {
  acceptCall,
  endActiveCallForUser,
  finishCall,
  getIceServers,
  inviteCall,
  listCallHistory,
  relaySignal,
};
