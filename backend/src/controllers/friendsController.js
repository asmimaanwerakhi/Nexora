const friendsService = require('../services/friendsService');
const { sendFriendRequestPush } = require('../services/pushService');
const AppError = require('../utils/AppError');
const { username: usernameSchema } = require('../validators/friendSchemas');

const emitToUser = (req, userId, event, payload) => {
  req.app.get('io')?.to(`user:${userId}`).emit(event, payload);
};

const searchUsers = async (req, res) => {
  const parsed = usernameSchema.safeParse(req.query.username);
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_USERNAME', 'Enter a valid username to search');
  }
  const users = await friendsService.searchUsers(req.user._id, parsed.data);
  res.status(200).json({ data: { users } });
};

const getPublicProfile = async (req, res) => {
  const user = await friendsService.getPublicProfile(req.user._id, req.params.profileSlug);
  res.status(200).json({ data: { user } });
};

const listFriends = async (req, res) => {
  const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 40) : '';
  const sort = req.query.sort === 'recent' ? 'recent' : 'name';
  const friends = await friendsService.listFriends(req.user._id, search, sort);
  res.status(200).json({ data: { friends } });
};

const listBlocked = async (req, res) => {
  const blocked = await friendsService.listBlocked(req.user._id);
  res.status(200).json({ data: { blocked } });
};

const listRequests = async (req, res) => {
  const requests = await friendsService.listRequests(req.user._id);
  res.status(200).json({ data: requests });
};

const sendRequest = async (req, res) => {
  const friendship = await friendsService.sendRequest(req.user._id, req.validatedBody.userId);
  const requester = {
    id: req.user._id.toString(),
    name: req.user.name,
    username: req.user.username || null,
    avatar: req.user.avatar,
    isOnline: req.user.isOnline,
  };
  const payload = {
    id: friendship._id.toString(),
    createdAt: friendship.createdAt,
    user: requester,
  };
  emitToUser(req, friendship.recipient, 'friend:request', payload);
  void sendFriendRequestPush({
    recipientId: friendship.recipient,
    requester,
  }).catch((error) => console.error('Could not send friend request push notification', error));
  res.status(201).json({ data: { request: { id: friendship._id.toString(), status: 'pending' } } });
};

const acceptRequest = async (req, res) => {
  const { friendship, conversation } = await friendsService.acceptRequest(
    req.user._id,
    req.params.requestId,
  );
  const conversationId = conversation._id.toString();
  emitToUser(req, friendship.requester, 'friend:accepted', {
    friendId: req.user._id.toString(),
    conversationId,
  });
  emitToUser(req, req.user._id, 'friend:accepted', {
    friendId: friendship.requester.toString(),
    conversationId,
  });
  res.status(200).json({ data: { accepted: true, conversationId: conversation._id.toString() } });
};

const rejectRequest = async (req, res) => {
  const friendship = await friendsService.rejectRequest(req.user._id, req.params.requestId);
  emitToUser(req, friendship.requester, 'friend:removed', {
    requestId: friendship._id.toString(),
  });
  res.status(200).json({
    data: {
      rejected: true,
      cooldownUntil: friendship.cooldownUntil,
    },
  });
};

const cancelRequest = async (req, res) => {
  const requestId = req.params.requestId;
  const recipientId = await friendsService.cancelRequest(req.user._id, requestId);
  emitToUser(req, recipientId, 'friend:removed', { requestId });
  res.status(200).json({ data: { cancelled: true } });
};

const removeFriend = async (req, res) => {
  const friendId = await friendsService.removeFriend(req.user._id, req.params.friendId);
  const payload = { userId: req.user._id.toString(), friendId };
  emitToUser(req, friendId, 'friend:removed', payload);
  emitToUser(req, req.user._id, 'friend:removed', payload);
  res.status(200).json({ data: { removed: true } });
};

const blockUser = async (req, res) => {
  const blockedId = await friendsService.blockUser(req.user._id, req.params.friendId);
  const payload = { userId: req.user._id.toString(), friendId: blockedId };
  emitToUser(req, blockedId, 'friend:removed', payload);
  emitToUser(req, req.user._id, 'friend:removed', payload);
  res.status(200).json({ data: { blocked: true } });
};

const unblockUser = async (req, res) => {
  await friendsService.unblockUser(req.user._id, req.params.friendId);
  res.status(200).json({ data: { unblocked: true } });
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
