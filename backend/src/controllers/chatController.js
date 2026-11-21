const authService = require('../services/authService');
const chatService = require('../services/chatService');
const groupService = require('../services/groupService');
const { deleteMessageMedia, uploadMessageMedia } = require('../services/messageMediaService');
const { sendMessagePush } = require('../services/pushService');
const AppError = require('../utils/AppError');
const { messageSearchSchema } = require('../validators/chatSchemas');

const emitToConversation = (req, conversationId, userIds, event, payload) => {
  const io = req.app.get('io');
  if (!io) return;
  let target = io.to(`conversation:${conversationId}`);
  for (const userId of userIds) {
    target = target.to(`user:${userId}`);
  }
  target.emit(event, payload);
};

const getConversations = async (req, res) => {
  const conversations = await chatService.getConversationList(req.user._id);
  res.status(200).json({ data: { conversations } });
};

const getParticipantId = (participant) =>
  participant.userId._id ? participant.userId._id.toString() : participant.userId.toString();

const emitGroupEvent = (io, conversation, event, payload, extraUserIds = []) => {
  if (!io) return;
  const conversationId = conversation._id.toString();
  let target = io.to(`group:${conversationId}`).to(`conversation:${conversationId}`);
  const userIds = new Set([
    ...conversation.participants.map(getParticipantId),
    ...extraUserIds.map((userId) => userId.toString()),
  ]);
  for (const userId of userIds) target = target.to(`user:${userId}`);
  target.emit(event, payload);
};

const notifyGroupUpdated = (io, conversation) => {
  emitGroupEvent(io, conversation, 'conversation:updated', {
    id: conversation._id.toString(),
  });
};

const notifyGroupMessage = (req, conversation, message, senderId) => {
  const io = req.app.get('io');
  emitGroupEvent(io, conversation, 'message:new', message);
  notifyGroupUpdated(io, conversation);
  for (const participant of conversation.participants) {
    const recipientId = getParticipantId(participant);
    if (recipientId === senderId.toString() || participant.notificationsMuted) continue;
    void sendMessagePush({
      recipientId,
      conversationId: conversation._id,
      message,
    }).catch((error) => console.error('Could not send group message push notification', error));
  }
};

const createConversation = async (req, res) => {
  if (req.validatedBody.type === 'group') {
    const { conversation } = await groupService.createGroup(req.user._id, req.validatedBody);
    const io = req.app.get('io');
    notifyGroupUpdated(io, conversation);
    res.status(201).json({
      data: { conversation: { id: conversation._id.toString(), type: 'group' } },
    });
    return;
  }
  const conversation = await chatService.createOrGetDirectConversation(
    req.user._id,
    req.validatedBody.participantId,
  );
  res.status(200).json({
    data: {
      conversation: {
        id: conversation._id.toString(),
        type: conversation.type,
      },
    },
  });
};

const getMessages = async (req, res) => {
  const result = await chatService.getMessageHistory(
    req.user._id,
    req.params.conversationId,
    req.query.cursor,
  );
  res.status(200).json({ data: result });
};

const notifyParticipants = async (req, conversationId, message) => {
  const { conversation } = await chatService.getConversationForUser(conversationId, req.user._id);
  if (conversation.type === 'group') {
    notifyGroupMessage(req, conversation, message, req.user._id);
    return;
  }
  const userIds = conversation.participants.map((participant) => participant.userId.toString());
  emitToConversation(req, conversationId, userIds, 'message:new', message);
  const recipientId = userIds.find((userId) => userId !== req.user._id.toString());
  if (recipientId) {
    void sendMessagePush({
      recipientId,
      conversationId,
      message,
    }).catch((error) => console.error('Could not send message push notification', error));
  }
};

const updateGroupInfo = async (req, res) => {
  const conversation = await groupService.updateGroupInfo(
    req.params.conversationId,
    req.user._id,
    req.validatedBody,
  );
  notifyGroupUpdated(req.app.get('io'), conversation);
  res.status(200).json({ data: { updated: true } });
};

const addGroupMember = async (req, res) => {
  const { conversation, message, member } = await groupService.addMember(
    req.params.conversationId,
    req.user._id,
    req.validatedBody.userId,
  );
  const io = req.app.get('io');
  notifyGroupMessage(req, conversation, message, req.user._id);
  io?.to(`user:${member._id}`).emit('conversation:updated', {
    id: conversation._id.toString(),
  });
  res.status(201).json({ data: { added: true } });
};

const removeGroupMember = async (req, res) => {
  const { conversation, message, removedUser } = await groupService.removeMember(
    req.params.conversationId,
    req.user._id,
    req.params.userId,
  );
  const io = req.app.get('io');
  const groupRoom = `group:${conversation._id}`;
  const conversationRoom = `conversation:${conversation._id}`;
  io?.in(`user:${removedUser._id}`).socketsLeave(groupRoom);
  io?.in(`user:${removedUser._id}`).socketsLeave(conversationRoom);
  io?.to(`user:${removedUser._id}`).emit('group:removed', {
    conversationId: conversation._id.toString(),
  });
  notifyGroupMessage(req, conversation, message, req.user._id);
  res.status(200).json({ data: { removed: true } });
};

const leaveGroup = async (req, res) => {
  const { conversation, message, leavingUser } = await groupService.leaveGroup(
    req.params.conversationId,
    req.user._id,
  );
  const io = req.app.get('io');
  io?.in(`user:${leavingUser._id}`).socketsLeave(`group:${conversation._id}`);
  io?.in(`user:${leavingUser._id}`).socketsLeave(`conversation:${conversation._id}`);
  io?.to(`user:${leavingUser._id}`).emit('group:removed', {
    conversationId: conversation._id.toString(),
  });
  notifyGroupMessage(req, conversation, message, req.user._id);
  res.status(200).json({ data: { left: true } });
};

const updateGroupAdmin = async (req, res) => {
  const conversation = await groupService.setAdminRole(
    req.params.conversationId,
    req.user._id,
    req.params.userId,
    req.validatedBody.role,
  );
  notifyGroupUpdated(req.app.get('io'), conversation);
  res.status(200).json({ data: { updated: true } });
};

const updateGroupPermissions = async (req, res) => {
  const conversation = await groupService.updatePermissions(
    req.params.conversationId,
    req.user._id,
    req.validatedBody,
  );
  notifyGroupUpdated(req.app.get('io'), conversation);
  res.status(200).json({ data: { updated: true } });
};

const updateGroupNotifications = async (req, res) => {
  const result = await groupService.updateNotifications(
    req.params.conversationId,
    req.user._id,
    req.validatedBody.muted,
  );
  res.status(200).json({ data: result });
};

const updateGroupAvatar = async (req, res) => {
  if (!req.file) throw new AppError(400, 'AVATAR_REQUIRED', 'Choose an image to upload');
  const conversation = await groupService.uploadGroupAvatar(
    req.params.conversationId,
    req.user._id,
    req.file,
  );
  notifyGroupUpdated(req.app.get('io'), conversation);
  res.status(200).json({ data: { updated: true, avatar: conversation.avatar } });
};

const sendTextMessage = async (req, res) => {
  const { conversationId, text, replyTo, clientMessageId } = req.validatedBody;
  const result = await chatService.sendTextMessage({
    userId: req.user._id,
    conversationId,
    text,
    replyTo,
    clientMessageId,
  });
  if (!result.reused) await notifyParticipants(req, conversationId, result.message);
  res.status(result.reused ? 200 : 201).json({ data: { message: result.message } });
};

const editMessage = async (req, res) => {
  const result = await chatService.editMessage(
    req.user._id,
    req.params.messageId,
    req.validatedBody.text,
  );
  const { conversation } = await chatService.getConversationForUser(
    result.conversationId,
    req.user._id,
  );
  emitToConversation(
    req,
    result.conversationId,
    conversation.participants.map((participant) => participant.userId.toString()),
    'message:edited',
    result.message,
  );
  emitToConversation(
    req,
    result.conversationId,
    conversation.participants.map((participant) => participant.userId.toString()),
    'conversation:updated',
    { id: result.conversationId, lastMessage: result.message },
  );
  res.status(200).json({ data: { message: result.message } });
};

const forwardMessage = async (req, res) => {
  const result = await chatService.forwardMessage(
    req.user._id,
    req.params.messageId,
    req.validatedBody.conversationId,
  );
  if (!result.reused) await notifyParticipants(req, result.conversationId, result.message);
  res.status(result.reused ? 200 : 201).json({ data: { message: result.message } });
};

const reactToMessage = async (req, res) => {
  const result = await chatService.toggleMessageReaction(
    req.user._id,
    req.params.messageId,
    req.validatedBody.emoji,
  );
  const { conversation } = await chatService.getConversationForUser(
    result.conversationId,
    req.user._id,
  );
  emitToConversation(
    req,
    result.conversationId,
    conversation.participants.map((participant) => participant.userId.toString()),
    'message:reaction',
    result.message,
  );
  res.status(200).json({ data: { message: result.message } });
};

const toggleStarMessage = async (req, res) => {
  const result = await chatService.toggleStarMessage(req.user._id, req.params.messageId);
  res.status(200).json({ data: result });
};

const getStarredMessages = async (req, res) => {
  const messages = await chatService.getStarredMessages(req.user._id);
  res.status(200).json({ data: { messages } });
};

const searchMessages = async (req, res) => {
  const parsed = messageSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Enter a search term between 2 and 100 characters');
  }
  const messages = await chatService.searchMessages(
    req.user._id,
    req.params.conversationId,
    parsed.data.q,
  );
  res.status(200).json({ data: { messages } });
};

const getPinnedMessages = async (req, res) => {
  const messages = await chatService.getPinnedMessages(req.user._id, req.params.conversationId);
  res.status(200).json({ data: { messages } });
};

const notifyPinnedMessages = async (req, conversationId, messages) => {
  const { conversation } = await chatService.getConversationForUser(conversationId, req.user._id);
  emitToConversation(
    req,
    conversationId,
    conversation.participants.map((participant) => participant.userId.toString()),
    'conversation:pins-updated',
    { conversationId, messages },
  );
};

const pinMessage = async (req, res) => {
  const messages = await chatService.pinMessage(
    req.user._id,
    req.params.conversationId,
    req.params.messageId,
  );
  await notifyPinnedMessages(req, req.params.conversationId, messages);
  res.status(200).json({ data: { messages } });
};

const unpinMessage = async (req, res) => {
  const messages = await chatService.unpinMessage(
    req.user._id,
    req.params.conversationId,
    req.params.messageId,
  );
  await notifyPinnedMessages(req, req.params.conversationId, messages);
  res.status(200).json({ data: { messages } });
};

const uploadMessage = async (req, res) => {
  if (!req.file) {
    throw new AppError(400, 'FILE_REQUIRED', 'Choose a file to send');
  }
  const { conversationId, text, replyTo, clientMessageId } = req.validatedBody;
  await chatService.authorizeDirectMessage(req.user._id, conversationId);
  const media = await uploadMessageMedia(req.file);
  const type = req.file.mimetype.startsWith('image/')
    ? 'image'
    : req.file.mimetype.startsWith('video/')
      ? 'video'
      : req.file.mimetype.startsWith('audio/')
        ? 'voice'
        : 'file';
  let result;
  try {
    result = await chatService.saveMediaMessage({
      userId: req.user._id,
      conversationId,
      text,
      replyTo,
      type,
      media,
      clientMessageId,
    });
  } catch (error) {
    try {
      await deleteMessageMedia(media);
    } catch (cleanupError) {
      console.error('Could not clean up an unreferenced uploaded message file', cleanupError);
    }
    throw error;
  }
  if (result.reused) {
    try {
      await deleteMessageMedia(media);
    } catch (error) {
      console.error('Could not clean up a duplicate message upload', error);
    }
  } else {
    await notifyParticipants(req, conversationId, result.message);
  }
  res.status(result.reused ? 200 : 201).json({ data: { message: result.message } });
};

const deleteMessage = async (req, res) => {
  const result = await chatService.deleteMessage(req.user._id, req.params.messageId, req.query.for);
  if (result.deletedMedia) {
    try {
      await deleteMessageMedia(result.deletedMedia);
    } catch (error) {
      console.error('Could not delete message media from Cloudinary', error);
    }
  }
  const { conversation } = await chatService.getConversationForUser(
    result.conversationId,
    req.user._id,
  );
  const userIds = conversation.participants.map((participant) => participant.userId.toString());
  const payload = {
    ...result.message,
    scope: req.query.for,
    deletedBy: req.user._id.toString(),
  };
  if (req.query.for === 'me') {
    req.app.get('io')?.to(`user:${req.user._id}`).emit('message:deleted', payload);
  } else if (conversation.type === 'group') {
    emitGroupEvent(req.app.get('io'), conversation, 'message:deleted', payload);
  } else {
    emitToConversation(req, result.conversationId, userIds, 'message:deleted', payload);
  }
  res.status(200).json({ data: { message: result.message } });
};

const updatePushToken = async (req, res) => {
  const { token } = req.validatedBody;
  await authService.updatePushToken(req.user._id, token);
  res.status(200).json({ data: { registered: true } });
};

const removePushToken = async (req, res) => {
  const { token } = req.validatedBody;
  await authService.removePushToken(req.user._id, token);
  res.status(200).json({ data: { removed: true } });
};

module.exports = {
  createConversation,
  addGroupMember,
  deleteMessage,
  editMessage,
  forwardMessage,
  getConversations,
  getPinnedMessages,
  getMessages,
  getStarredMessages,
  leaveGroup,
  removeGroupMember,
  removePushToken,
  pinMessage,
  reactToMessage,
  searchMessages,
  sendTextMessage,
  toggleStarMessage,
  unpinMessage,
  updateGroupAdmin,
  updateGroupAvatar,
  updateGroupInfo,
  updateGroupNotifications,
  updateGroupPermissions,
  updatePushToken,
  uploadMessage,
};
