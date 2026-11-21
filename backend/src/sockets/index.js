const { Server } = require('socket.io');
const { getAllowedOrigins } = require('../config/cors');
const Friendship = require('../models/friendship');
const User = require('../models/user');
const { authenticateAccessToken } = require('../services/tokenService');
const {
  connectUser,
  disconnectAllUserSockets,
  disconnectUser,
} = require('../services/presenceService');
const AppError = require('../utils/AppError');
const attachChatSocket = require('./chatSocket');
const attachCallSocket = require('./callSocket');
const attachMeetingSocket = require('./meetingSocket');
const { endActiveCallForUser } = require('../services/callService');

const emitPresenceToFriends = async (io, user, presence) => {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: user._id }, { recipient: user._id }],
  }).select('requester recipient');
  const friendIds = friendships.map((friendship) =>
    friendship.requester.toString() === user._id.toString()
      ? friendship.recipient.toString()
      : friendship.requester.toString(),
  );
  const lastSeen =
    user.privacy.lastSeenVisibility === 'nobody' ||
    (user.privacy.lastSeenVisibility === 'friends' && !friendIds.length)
      ? null
      : presence.lastSeen;
  for (const friendId of friendIds) {
    io.to(`user:${friendId}`).emit('presence:update', {
      userId: user._id.toString(),
      online: presence.online,
      lastSeen,
    });
  }
};

const createSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (typeof token !== 'string' || !token) {
        throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
      }

      const authenticated = await authenticateAccessToken(token);
      socket.data.user = authenticated.user;
      socket.data.accessTokenExpiresAt = authenticated.claims.exp * 1000;
      next();
    } catch (error) {
      if (error.statusCode === 401) {
        next(new Error('Unauthorized'));
        return;
      }
      console.error('Socket authentication failed', error);
      next(new Error('Authentication service unavailable'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    const userId = user._id.toString();
    const becameOnline = connectUser(userId, socket.id);
    socket.join(`user:${userId}`);
    const expiryTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.accessTokenExpiresAt - Date.now()),
    );
    attachChatSocket(io, socket);
    attachCallSocket(io, socket);
    attachMeetingSocket(io, socket);

    if (becameOnline) {
      void User.updateOne({ _id: user._id }, { $set: { isOnline: true } })
        .then(async (result) => {
          if (result.matchedCount !== 1) {
            throw new Error('Authenticated user disappeared before presence was recorded');
          }
          if (user.privacy.showOnlineStatus) {
            await emitPresenceToFriends(io, user, { online: true, lastSeen: null });
          }
        })
        .catch((error) => {
          disconnectAllUserSockets(userId);
          console.error('Could not record user online presence', error);
          io.in(`user:${userId}`).disconnectSockets(true);
        });
    }

    socket.on('health:ping', (_payload, acknowledge) => {
      if (typeof acknowledge !== 'function') {
        return;
      }

      acknowledge({
        event: 'health:pong',
        ok: true,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason) => {
      clearTimeout(expiryTimer);
      const becameOffline = disconnectUser(userId, socket.id);
      if (!becameOffline) {
        return;
      }

      void endActiveCallForUser(io, userId);
      const lastSeen = new Date();
      void User.updateOne({ _id: user._id }, { $set: { isOnline: false, lastSeen } })
        .then(async (result) => {
          if (result.matchedCount === 1 && user.privacy.showOnlineStatus) {
            await emitPresenceToFriends(io, user, { online: false, lastSeen });
          }
        })
        .catch((error) => {
          console.error(`Could not record user offline presence (${reason})`, error);
        });
    });
  });

  return io;
};

module.exports = createSocketServer;
