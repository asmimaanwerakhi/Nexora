const mongoose = require('mongoose');
const Block = require('../models/block');
const Friendship = require('../models/friendship');
const User = require('../models/user');
const AppError = require('../utils/AppError');
const profileSlugFor = require('../utils/profileSlug');
const chatService = require('./chatService');

const userProjection = 'name username avatar isOnline lastSeen privacy';
const publicProfileProjection = 'name username avatar coverPhoto bio about privacy createdAt';
const friendError = () =>
  new AppError(404, 'FRIENDSHIP_NOT_FOUND', 'Friend or friend request not found');

const pairFor = (firstId, secondId) => [firstId.toString(), secondId.toString()].sort();

const ensureNotBlocked = async (firstId, secondId) => {
  const blocked = await Block.exists({
    $or: [
      { blocker: firstId, blocked: secondId },
      { blocker: secondId, blocked: firstId },
    ],
  });
  if (blocked) {
    throw new AppError(403, 'USER_BLOCKED', 'This user is not available');
  }
};

const publicUser = (user, isFriend = false) => ({
  id: user._id.toString(),
  name: user.name,
  username: user.username || null,
  profileSlug: profileSlugFor(user),
  avatar: user.avatar,
  isOnline: user.privacy?.showOnlineStatus === false ? false : Boolean(user.isOnline),
  lastSeen:
    user.privacy?.lastSeenVisibility === 'nobody' ||
    (user.privacy?.lastSeenVisibility === 'friends' && !isFriend) ||
    user.privacy?.showOnlineStatus === false
      ? null
      : user.lastSeen,
});

const getRelationshipStatus = async (firstId, secondId) => {
  const [pairLow, pairHigh] = pairFor(firstId, secondId);
  const friendship = await Friendship.findOne({ pairLow, pairHigh }).select(
    '_id requester recipient status cooldownUntil',
  );
  if (!friendship) return null;
  return {
    requestId: friendship._id.toString(),
    status: friendship.status,
    direction: friendship.requester.toString() === firstId.toString() ? 'outgoing' : 'incoming',
    cooldownUntil: friendship.cooldownUntil,
  };
};

const searchUsers = async (userId, username) => {
  const normalizedUsername = username.replace(/^@/, '').toLowerCase();
  const users = await User.find({
    username: normalizedUsername,
    _id: { $ne: userId },
    isVerified: true,
  })
    .select(userProjection)
    .limit(10)
    .lean();
  const results = [];
  for (const user of users) {
    if (user.privacy?.profileVisibility === 'friends') {
      const [pairLow, pairHigh] = pairFor(userId, user._id);
      const accepted = await Friendship.exists({ pairLow, pairHigh, status: 'accepted' });
      if (!accepted) continue;
    }
    if (user.privacy?.allowFriendRequests === false) continue;
    const blocked = await Block.exists({
      $or: [
        { blocker: userId, blocked: user._id },
        { blocker: user._id, blocked: userId },
      ],
    });
    if (blocked) continue;
    const relationship = await getRelationshipStatus(userId, user._id);
    results.push({
      ...publicUser(user, relationship?.status === 'accepted'),
      relationship,
    });
  }
  return results;
};

const getPublicProfile = async (viewerId, profileSlug) => {
  const normalizedSlug = profileSlug.toLowerCase();
  let user = await User.findOne({ username: normalizedSlug, isVerified: true })
    .select(publicProfileProjection)
    .lean();

  if (!user) {
    const generatedId = normalizedSlug.match(/-([a-f0-9]{24})$/)?.[1];
    if (generatedId) {
      user = await User.findOne({ _id: generatedId, isVerified: true })
        .select(publicProfileProjection)
        .lean();
      if (user && profileSlugFor(user) !== normalizedSlug) user = null;
    }
  }
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Profile not found');

  const isSelf = viewerId.toString() === user._id.toString();
  let isFriend = false;
  if (!isSelf) {
    await ensureNotBlocked(viewerId, user._id);
    const [pairLow, pairHigh] = pairFor(viewerId, user._id);
    isFriend = Boolean(await Friendship.exists({ pairLow, pairHigh, status: 'accepted' }));
  }
  if (!isSelf && user.privacy?.profileVisibility === 'friends' && !isFriend) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Profile not found');
  }

  const legacyAbout = user.bio?.length > 160 && !user.about ? user.bio : '';
  return {
    id: user._id.toString(),
    name: user.name,
    username: user.username || null,
    profileSlug: profileSlugFor(user),
    avatar: user.avatar,
    coverPhoto: user.coverPhoto,
    bio: legacyAbout ? '' : user.bio,
    about: user.about || legacyAbout,
    createdAt: user.createdAt,
    isFriend,
  };
};

const listFriends = async (userId, search = '', sort = 'name') => {
  const records = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  })
    .select('requester recipient respondedAt createdAt')
    .lean();
  const ids = records.map((record) =>
    record.requester.toString() === userId.toString() ? record.recipient : record.requester,
  );
  if (!ids.length) return [];
  const friendshipByFriendId = new Map(
    records.map((record) => {
      const friendId =
        record.requester.toString() === userId.toString() ? record.recipient : record.requester;
      return [friendId.toString(), record];
    }),
  );
  const blocks = await Block.find({
    $or: [
      { blocker: userId, blocked: { $in: ids } },
      { blocked: userId, blocker: { $in: ids } },
    ],
  })
    .select('blocker blocked')
    .lean();
  const blockedIds = new Set(
    blocks.map((block) =>
      block.blocker.toString() === userId.toString()
        ? block.blocked.toString()
        : block.blocker.toString(),
    ),
  );
  const searchPattern = search
    ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : null;
  const filter = { _id: { $in: ids.filter((id) => !blockedIds.has(id.toString())) } };
  if (searchPattern) filter.$or = [{ name: searchPattern }, { username: searchPattern }];
  let userQuery = User.find(filter).select(userProjection);
  if (sort !== 'recent') userQuery = userQuery.sort({ name: 1 });
  const users = await userQuery.lean();
  if (sort === 'recent') {
    users.sort((first, second) => {
      const firstFriendship = friendshipByFriendId.get(first._id.toString());
      const secondFriendship = friendshipByFriendId.get(second._id.toString());
      const firstAcceptedAt = firstFriendship?.respondedAt || firstFriendship?.createdAt || 0;
      const secondAcceptedAt = secondFriendship?.respondedAt || secondFriendship?.createdAt || 0;
      const recency = new Date(secondAcceptedAt).getTime() - new Date(firstAcceptedAt).getTime();
      return recency || first.name.localeCompare(second.name);
    });
  }
  return users.map((user) => publicUser(user, true));
};

const listRequests = async (userId) => {
  const [incoming, outgoing] = await Promise.all([
    Friendship.find({ recipient: userId, status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('requester', userProjection)
      .lean(),
    Friendship.find({ requester: userId, status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('recipient', userProjection)
      .lean(),
  ]);
  return {
    incoming: incoming
      .filter((record) => record.requester)
      .map((record) => ({
        id: record._id.toString(),
        createdAt: record.createdAt,
        user: publicUser(record.requester),
      })),
    outgoing: outgoing
      .filter((record) => record.recipient)
      .map((record) => ({
        id: record._id.toString(),
        createdAt: record.createdAt,
        user: publicUser(record.recipient),
      })),
  };
};

const listBlocked = async (userId) => {
  const blocks = await Block.find({ blocker: userId })
    .sort({ createdAt: -1 })
    .populate('blocked', userProjection)
    .lean();
  return blocks
    .filter((block) => block.blocked)
    .map((block) => ({
      id: block.blocked._id.toString(),
      name: block.blocked.name,
      username: block.blocked.username || null,
      avatar: block.blocked.avatar,
    }));
};

const sendRequest = async (userId, recipientId) => {
  if (!mongoose.isValidObjectId(recipientId) || userId.toString() === recipientId.toString()) {
    throw new AppError(400, 'INVALID_FRIEND_REQUEST', 'Choose another valid user');
  }
  const recipient = await User.findOne({ _id: recipientId, isVerified: true }).select(
    '_id privacy',
  );
  if (!recipient) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  if (recipient.privacy?.allowFriendRequests === false) {
    throw new AppError(
      403,
      'FRIEND_REQUESTS_DISABLED',
      'This user is not accepting friend requests',
    );
  }
  await ensureNotBlocked(userId, recipientId);
  const [pairLow, pairHigh] = pairFor(userId, recipientId);
  let friendship = await Friendship.findOne({ pairLow, pairHigh });
  if (friendship?.status === 'accepted') {
    throw new AppError(409, 'ALREADY_FRIENDS', 'You are already friends');
  }
  if (friendship?.status === 'pending') {
    throw new AppError(409, 'REQUEST_ALREADY_PENDING', 'A friend request is already pending');
  }
  if (friendship?.cooldownUntil && friendship.cooldownUntil > new Date()) {
    throw new AppError(
      429,
      'FRIEND_REQUEST_COOLDOWN',
      'You cannot send another request to this user yet',
    );
  }
  if (friendship) {
    friendship.requester = userId;
    friendship.recipient = recipientId;
    friendship.status = 'pending';
    friendship.respondedAt = null;
    friendship.cooldownUntil = null;
    await friendship.save();
  } else {
    try {
      friendship = await Friendship.create({
        requester: userId,
        recipient: recipientId,
        pairLow,
        pairHigh,
      });
    } catch (error) {
      if (error.code === 11000) {
        throw new AppError(409, 'REQUEST_ALREADY_PENDING', 'A friend request already exists');
      }
      throw error;
    }
  }
  return friendship;
};

const acceptRequest = async (userId, requestId) => {
  if (!mongoose.isValidObjectId(requestId)) throw friendError();
  const friendship = await Friendship.findOneAndUpdate(
    { _id: requestId, recipient: userId, status: 'pending' },
    {
      $set: {
        status: 'accepted',
        respondedAt: new Date(),
        cooldownUntil: null,
        rejectionCount: 0,
      },
    },
    { new: true, runValidators: true },
  );
  if (!friendship) throw friendError();
  const conversation = await chatService.createOrGetDirectConversation(
    friendship.requester,
    friendship.recipient,
  );
  return { friendship, conversation };
};

const rejectRequest = async (userId, requestId) => {
  if (!mongoose.isValidObjectId(requestId)) throw friendError();
  const friendship = await Friendship.findOne({
    _id: requestId,
    recipient: userId,
    status: 'pending',
  });
  if (!friendship) throw friendError();
  friendship.rejectionCount += 1;
  friendship.status = 'rejected';
  friendship.respondedAt = new Date();
  friendship.cooldownUntil =
    friendship.rejectionCount >= 3 ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
  await friendship.save();
  return friendship;
};

const cancelRequest = async (userId, requestId) => {
  if (!mongoose.isValidObjectId(requestId)) throw friendError();
  const friendship = await Friendship.findOneAndDelete({
    _id: requestId,
    requester: userId,
    status: 'pending',
  });
  if (!friendship) throw friendError();
  return friendship.recipient.toString();
};

const removeFriend = async (userId, friendId) => {
  if (!mongoose.isValidObjectId(friendId) || userId.toString() === friendId.toString()) {
    throw friendError();
  }
  const result = await Friendship.deleteOne({
    status: 'accepted',
    $or: [
      { requester: userId, recipient: friendId },
      { requester: friendId, recipient: userId },
    ],
  });
  if (!result.deletedCount) throw friendError();
  return friendId.toString();
};

const blockUser = async (userId, blockedId) => {
  if (!mongoose.isValidObjectId(blockedId) || userId.toString() === blockedId.toString()) {
    throw new AppError(400, 'INVALID_BLOCK', 'Choose another valid user');
  }
  if (!(await User.exists({ _id: blockedId })))
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  await Block.updateOne(
    { blocker: userId, blocked: blockedId },
    { $setOnInsert: { blocker: userId, blocked: blockedId } },
    { upsert: true },
  );
  const [pairLow, pairHigh] = pairFor(userId, blockedId);
  await Friendship.deleteOne({ pairLow, pairHigh });
  return blockedId.toString();
};

const unblockUser = async (userId, blockedId) => {
  if (!mongoose.isValidObjectId(blockedId)) throw friendError();
  const result = await Block.deleteOne({ blocker: userId, blocked: blockedId });
  if (!result.deletedCount) throw friendError();
  return blockedId.toString();
};

module.exports = {
  acceptRequest,
  blockUser,
  cancelRequest,
  getPublicProfile,
  listFriends,
  listBlocked,
  listRequests,
  rejectRequest,
  removeFriend,
  searchUsers,
  sendRequest,
  unblockUser,
};
