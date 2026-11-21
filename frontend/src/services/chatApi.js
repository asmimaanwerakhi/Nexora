import { apiClient } from './apiClient.js';

export const getConversations = async () => {
  const response = await apiClient.get('/conversations');
  return response.data.data.conversations;
};

export const getCallHistory = async (cursor) => {
  const response = await apiClient.get('/calls', { params: cursor ? { cursor } : {} });
  return response.data.data;
};

export const getFriends = async (search = '') => {
  const response = await apiClient.get('/friends', { params: search ? { q: search } : {} });
  return response.data.data.friends;
};

export const getRecentFriends = async () => {
  const response = await apiClient.get('/friends', { params: { sort: 'recent' } });
  return response.data.data.friends;
};

export const searchUsers = async (username) => {
  const response = await apiClient.get('/users/search', { params: { username } });
  return response.data.data.users;
};

export const getPublicProfile = async (profileSlug) => {
  const response = await apiClient.get(`/users/profile/${encodeURIComponent(profileSlug)}`);
  return response.data.data.user;
};

export const getFriendRequests = async () => {
  const response = await apiClient.get('/friends/requests');
  return response.data.data;
};

export const getBlockedUsers = async () => {
  const response = await apiClient.get('/friends/blocked');
  return response.data.data.blocked;
};

export const sendFriendRequest = async (userId) => {
  const response = await apiClient.post('/friends/request', { userId });
  return response.data.data.request;
};

export const acceptFriendRequest = async (requestId) => {
  const response = await apiClient.post(`/friends/requests/${requestId}/accept`);
  return response.data.data;
};

export const rejectFriendRequest = async (requestId) => {
  const response = await apiClient.post(`/friends/requests/${requestId}/reject`);
  return response.data.data;
};

export const cancelFriendRequest = async (requestId) => {
  await apiClient.delete(`/friends/requests/${requestId}`);
};

export const removeFriend = async (friendId) => {
  await apiClient.delete(`/friends/${friendId}`);
};

export const blockFriend = async (friendId) => {
  await apiClient.post(`/friends/${friendId}/block`);
};

export const unblockFriend = async (friendId) => {
  await apiClient.delete(`/friends/${friendId}/block`);
};

export const createDirectConversation = async (participantId) => {
  const response = await apiClient.post('/conversations', { participantId });
  return response.data.data.conversation;
};

export const createGroupConversation = async ({ name, description, participantIds }) => {
  const response = await apiClient.post('/conversations', {
    type: 'group',
    name,
    description,
    participantIds,
  });
  return response.data.data.conversation;
};

export const updateGroupInfo = async (conversationId, changes) => {
  await apiClient.patch(`/conversations/${conversationId}`, changes);
};

export const uploadGroupAvatar = async (conversationId, file) => {
  const formData = new FormData();
  formData.append('avatar', file);
  const response = await apiClient.post(`/conversations/${conversationId}/avatar`, formData);
  return response.data.data.avatar;
};

export const addGroupMember = async (conversationId, userId) => {
  await apiClient.post(`/conversations/${conversationId}/members`, { userId });
};

export const removeGroupMember = async (conversationId, userId) => {
  await apiClient.delete(`/conversations/${conversationId}/members/${userId}`);
};

export const leaveGroup = async (conversationId) => {
  await apiClient.post(`/conversations/${conversationId}/leave`);
};

export const updateGroupAdmin = async (conversationId, userId, role) => {
  await apiClient.patch(`/conversations/${conversationId}/admins/${userId}`, { role });
};

export const updateGroupPermissions = async (conversationId, permissions) => {
  await apiClient.patch(`/conversations/${conversationId}/permissions`, permissions);
};

export const updateGroupNotifications = async (conversationId, muted) => {
  const response = await apiClient.patch(`/conversations/${conversationId}/notifications`, {
    muted,
  });
  return response.data.data.muted;
};

export const getMessages = async (conversationId, cursor) => {
  const response = await apiClient.get(`/conversations/${conversationId}/messages`, {
    params: cursor ? { cursor } : {},
  });
  return response.data.data;
};

export const searchMessages = async (conversationId, q) => {
  const response = await apiClient.get(`/conversations/${conversationId}/messages/search`, {
    params: { q },
  });
  return response.data.data.messages;
};

export const getPinnedMessages = async (conversationId) => {
  const response = await apiClient.get(`/conversations/${conversationId}/pins`);
  return response.data.data.messages;
};

export const pinMessage = async (conversationId, messageId) => {
  const response = await apiClient.post(`/conversations/${conversationId}/pins/${messageId}`);
  return response.data.data.messages;
};

export const unpinMessage = async (conversationId, messageId) => {
  const response = await apiClient.delete(`/conversations/${conversationId}/pins/${messageId}`);
  return response.data.data.messages;
};

export const editMessage = async (messageId, text) => {
  const response = await apiClient.patch(`/messages/${messageId}`, { text });
  return response.data.data.message;
};

export const forwardMessage = async (messageId, conversationId) => {
  const response = await apiClient.post(`/messages/${messageId}/forward`, { conversationId });
  return response.data.data.message;
};

export const reactToMessage = async (messageId, emoji) => {
  const response = await apiClient.post(`/messages/${messageId}/reaction`, { emoji });
  return response.data.data.message;
};

export const toggleStarMessage = async (messageId) => {
  const response = await apiClient.post(`/messages/${messageId}/star`);
  return response.data.data.starred;
};

export const getStarredMessages = async () => {
  const response = await apiClient.get('/messages/starred');
  return response.data.data.messages;
};

export const reportUser = async ({ reportedUserId, messageId, reason, details = '' }) => {
  const response = await apiClient.post('/reports', {
    reportedUserId,
    messageId,
    reason,
    details,
  });
  return response.data.data.report;
};

export const sendMessageFile = async (conversationId, file, options = {}) => {
  const formData = new FormData();
  formData.append('conversationId', conversationId);
  if (options.text) formData.append('text', options.text);
  if (options.replyTo) formData.append('replyTo', options.replyTo);
  if (options.clientMessageId) formData.append('clientMessageId', options.clientMessageId);
  formData.append('file', file);
  const response = await apiClient.post('/messages/upload', formData);
  return response.data.data.message;
};

export const deleteMessage = async (messageId, scope) => {
  const response = await apiClient.delete(`/messages/${messageId}`, {
    params: { for: scope },
  });
  return response.data.data.message;
};

export const registerPushToken = async (token) => {
  await apiClient.post('/users/me/push-token', { token });
};
