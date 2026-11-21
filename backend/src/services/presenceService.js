const User = require('../models/user');

const connectionsByUser = new Map();

const connectUser = (userId, socketId) => {
  const connections = connectionsByUser.get(userId) || new Set();
  const wasOnline = connections.size > 0;
  connections.add(socketId);
  connectionsByUser.set(userId, connections);
  return !wasOnline;
};

const disconnectUser = (userId, socketId) => {
  const connections = connectionsByUser.get(userId);
  if (!connections) {
    return false;
  }

  connections.delete(socketId);
  if (connections.size > 0) {
    return false;
  }

  connectionsByUser.delete(userId);
  return true;
};

const resetPresence = async () => {
  connectionsByUser.clear();
  await User.updateMany({ isOnline: true }, { $set: { isOnline: false, lastSeen: new Date() } });
};

const disconnectAllUserSockets = (userId) => {
  const connections = connectionsByUser.get(userId);
  connectionsByUser.delete(userId);
  return connections ? [...connections] : [];
};

module.exports = {
  connectUser,
  disconnectAllUserSockets,
  disconnectUser,
  resetPresence,
};
