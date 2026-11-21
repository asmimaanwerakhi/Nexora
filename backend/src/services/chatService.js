const mongoose = require('mongoose');
const Block = require('../models/block');
const Conversation = require('../models/conversation');
const Friendship = require('../models/friendship');
const Message = require('../models/message');
const User = require('../models/user');
const AppError = require('../utils/AppError');

const PAGE_SIZE = 30;
const SEARCH_PAGE_SIZE = 20;
const MAX_PINNED_MESSAGES = 20;

const messageError = () =>
  new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found in this conversation');
const conversationError = () =>
  new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');

const getDirectKey = (firstId, secondId) => {
  const ids = [firstId.toString().toLowerCase(), secondId.toString().toLowerCase()].sort();
  return ids.join(':');
};

const ensureNotBlocked = async (firstId, secondId) => {
  const blocked = await Block.exists({
    $or: [
      { blocker: firstId, blocked: secondId },
      { blocker: secondId, blocked: firstId },
    ],
  });
  if (blocked) {
    throw new AppError(403, 'CHAT_BLOCKED', 'This conversation is not available');
  }
};

const ensureFriendship = async (firstId, secondId) => {
  const [pairLow, pairHigh] = [
    firstId.toString().toLowerCase(),
    secondId.toString().toLowerCase(),
  ].sort();
  const friendship = await Friendship.findOne({
    pairLow,
    pairHigh,
    status: 'accepted',
  }).select('_id');
  if (!friendship) {
    throw new AppError(403, 'FRIENDSHIP_REQUIRED', 'You can only chat with an accepted friend');
  }
};

const getConversationForUser = async (conversationId, userId) => {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw conversationError();
  }
  const conversation = await Conversation.findOne({
    _id: conversationId,
    'participants.userId': userId,
  });
  if (!conversation) {
    throw conversationError();
  }
  if (conversation.type === 'direct') {
    const otherParticipant = conversation.participants.find(
      (participant) => participant.userId.toString() !== userId.toString(),
    );
    if (!otherParticipant) throw conversationError();
    await ensureNotBlocked(userId, otherParticipant.userId);
    return { conversation, otherUserId: otherParticipant.userId };
  }
  return { conversation, otherUserId: null };
};

const ensureCanSend = async (conversation, senderId) => {
  if (conversation.type === 'group') {
    const sender = conversation.participants.find(
      (participant) => participant.userId.toString() === senderId.toString(),
    );
    if (!sender) throw conversationError();
    if (conversation.permissions.adminsOnlyMessages && !['owner', 'admin'].includes(sender.role)) {
      throw new AppError(403, 'GROUP_MESSAGES_ADMIN_ONLY', 'Only group admins can send messages');
    }
    return conversation.participants
      .filter((participant) => participant.userId.toString() !== senderId.toString())
      .map((participant) => participant.userId);
  }
  const recipient = conversation.participants.find(
    (participant) => participant.userId.toString() !== senderId.toString(),
  );
  if (!recipient) {
    throw conversationError();
  }
  await ensureNotBlocked(senderId, recipient.userId);
  await ensureFriendship(senderId, recipient.userId);
  return [recipient.userId];
};

const authorizeDirectMessage = async (userId, conversationId) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  await ensureCanSend(conversation, userId);
};

const serializeMessage = (message) => {
  const value = typeof message.toObject === 'function' ? message.toObject() : message;
  return {
    ...value,
    _id: value._id.toString(),
    conversationId: value.conversationId._id?.toString() || value.conversationId.toString(),
    sender:
      value.sender && typeof value.sender === 'object'
        ? {
            id: value.sender._id.toString(),
            name: value.sender.name,
            avatar: value.sender.avatar,
          }
        : value.sender?.toString() || null,
    replyTo:
      value.replyTo && typeof value.replyTo === 'object'
        ? {
            id: value.replyTo._id.toString(),
            text: value.replyTo.deletedForAll ? 'Message deleted' : value.replyTo.text,
            type: value.replyTo.type,
            senderName: value.replyTo.sender?.name || '',
          }
        : value.replyTo?.toString() || null,
    forwarded: Boolean(value.forwardedFrom),
    forwardedFrom: value.forwardedFrom?.toString() || null,
  };
};

const getConversationList = async (userId) => {
  const blocks = await Block.find({
    $or: [{ blocker: userId }, { blocked: userId }],
  }).select('blocker blocked');
  const blockedUserIds = new Set(
    blocks.map((block) =>
      block.blocker.toString() === userId.toString()
        ? block.blocked.toString()
        : block.blocker.toString(),
    ),
  );
  const conversations = await Conversation.find({ 'participants.userId': userId })
    .sort({ updatedAt: -1 })
    .populate('participants.userId', 'name username avatar isOnline lastSeen privacy')
    .lean();
  const acceptedFriendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  }).select('requester recipient');
  const acceptedFriendIds = new Set(
    acceptedFriendships.map((friendship) =>
      friendship.requester.toString() === userId.toString()
        ? friendship.recipient.toString()
        : friendship.requester.toString(),
    ),
  );

  return conversations
    .filter((conversation) => conversation.participants.every((participant) => participant.userId))
    .map((conversation) => {
      const current = conversation.participants.find(
        (participant) => participant.userId._id.toString() === userId.toString(),
      );
      if (!current) return null;
      if (conversation.type === 'group') {
        const members = conversation.participants.map((participant) => ({
          id: participant.userId._id.toString(),
          name: participant.userId.name,
          avatar: participant.userId.avatar,
          role: participant.role,
          joinedAt: participant.joinedAt,
          notificationsMuted: participant.notificationsMuted,
        }));
        return {
          id: conversation._id.toString(),
          type: 'group',
          name: conversation.name,
          description: conversation.description,
          avatar: conversation.avatar,
          participant: {
            id: conversation._id.toString(),
            name: conversation.name,
            avatar: conversation.avatar,
            isOnline: false,
            lastSeen: null,
          },
          members,
          currentRole: current.role,
          permissions: conversation.permissions,
          muted: current.notificationsMuted,
          canSend:
            !conversation.permissions.adminsOnlyMessages ||
            ['owner', 'admin'].includes(current.role),
          unreadCount: current.unreadCount,
          lastMessage: conversation.lastMessage,
          updatedAt: conversation.updatedAt,
        };
      }
      if (conversation.participants.length !== 2) return null;
      const other = conversation.participants.find(
        (participant) => participant.userId._id.toString() !== userId.toString(),
      );
      if (!other) return null;
      const user = other.userId;
      if (blockedUserIds.has(user._id.toString())) return null;
      const blocked =
        user.privacy?.showOnlineStatus === false
          ? { isOnline: false, lastSeen: null }
          : {
              isOnline: Boolean(user.isOnline),
              lastSeen:
                user.privacy?.lastSeenVisibility === 'nobody' ||
                (user.privacy?.lastSeenVisibility === 'friends' &&
                  !acceptedFriendIds.has(user._id.toString()))
                  ? null
                  : user.lastSeen,
            };
      return {
        id: conversation._id.toString(),
        type: conversation.type,
        participant: {
          id: user._id.toString(),
          name: user.name,
          username: user.username || null,
          avatar: user.avatar,
          ...blocked,
        },
        lastMessage: conversation.lastMessage,
        unreadCount: current.unreadCount,
        canSend:
          acceptedFriendIds.has(user._id.toString()) && !blockedUserIds.has(user._id.toString()),
        updatedAt: conversation.updatedAt,
      };
    })
    .filter(Boolean);
};

const createOrGetDirectConversation = async (userId, participantId) => {
  if (!mongoose.isValidObjectId(participantId) || userId.toString() === participantId.toString()) {
    throw new AppError(400, 'INVALID_PARTICIPANT', 'Choose another valid user');
  }
  const otherUser = await User.findById(participantId).select('_id');
  if (!otherUser) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  await ensureNotBlocked(userId, participantId);
  await ensureFriendship(userId, participantId);

  const directKey = getDirectKey(userId, participantId);
  try {
    return await Conversation.findOneAndUpdate(
      { directKey },
      {
        $setOnInsert: {
          type: 'direct',
          directKey,
          participants: [{ userId }, { userId: participantId }],
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    const conversation = await Conversation.findOne({ directKey });
    if (!conversation) throw error;
    return conversation;
  }
};

const getMessageHistory = async (userId, conversationId, cursor) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const query = { conversationId: conversation._id, deletedFor: { $ne: userId } };
  if (cursor) {
    if (!mongoose.isValidObjectId(cursor)) {
      throw new AppError(400, 'INVALID_CURSOR', 'The message cursor is invalid');
    }
    const cursorMessage = await Message.findOne({
      _id: cursor,
      conversationId: conversation._id,
    }).select('createdAt');
    if (!cursorMessage) {
      throw new AppError(400, 'INVALID_CURSOR', 'The message cursor is invalid');
    }
    query.$or = [
      { createdAt: { $lt: cursorMessage.createdAt } },
      { createdAt: cursorMessage.createdAt, _id: { $lt: cursorMessage._id } },
    ];
  }
  const documents = await Message.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(PAGE_SIZE + 1)
    .populate('sender', 'name avatar')
    .populate({
      path: 'replyTo',
      select: 'text type deletedForAll sender',
      populate: { path: 'sender', select: 'name' },
    });
  const hasMore = documents.length > PAGE_SIZE;
  const page = documents.slice(0, PAGE_SIZE);
  const nextCursor = hasMore ? page[page.length - 1]._id.toString() : null;
  return { messages: page.reverse().map(serializeMessage), nextCursor, hasMore };
};

const saveMessage = async ({
  userId,
  conversation,
  recipientIds,
  text,
  replyTo,
  media,
  type,
  clientMessageId,
  forwardedFrom,
}) => {
  if (clientMessageId) {
    const existing = await Message.findOne({
      conversationId: conversation._id,
      sender: userId,
      clientMessageId,
    })
      .populate('sender', 'name avatar')
      .populate({
        path: 'replyTo',
        select: 'text type deletedForAll sender',
        populate: { path: 'sender', select: 'name' },
      });
    if (existing) return { message: serializeMessage(existing), reused: true };
  }

  let repliedMessage = null;
  if (replyTo) {
    repliedMessage = await Message.findOne({
      _id: replyTo,
      conversationId: conversation._id,
      deletedForAll: false,
    });
    if (!repliedMessage) {
      throw new AppError(400, 'INVALID_REPLY_TARGET', 'The replied-to message is unavailable');
    }
  }
  let message;
  try {
    message = await Message.create({
      conversationId: conversation._id,
      sender: userId,
      type,
      text: text || '',
      media: media || null,
      replyTo: repliedMessage?._id || null,
      clientMessageId: clientMessageId || null,
      forwardedFrom: forwardedFrom || null,
      receipts: recipientIds.map((recipientId) => ({ userId: recipientId })),
    });
  } catch (error) {
    if (error.code !== 11000 || !clientMessageId) throw error;
    const existing = await Message.findOne({
      conversationId: conversation._id,
      sender: userId,
      clientMessageId,
    })
      .populate('sender', 'name avatar')
      .populate({
        path: 'replyTo',
        select: 'text type deletedForAll sender',
        populate: { path: 'sender', select: 'name' },
      });
    if (!existing) throw error;
    return { message: serializeMessage(existing), reused: true };
  }
  const preview = text?.trim()
    ? text.trim().slice(0, 200)
    : {
        image: 'Photo',
        video: 'Video',
        voice: 'Voice message',
        file: media?.originalName || 'File',
      }[type];
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: {
          messageId: message._id,
          senderId: userId,
          preview,
          type,
          sentAt: message.createdAt,
        },
      },
      $inc: { 'participants.$[recipient].unreadCount': 1 },
    },
    { arrayFilters: [{ 'recipient.userId': { $in: recipientIds } }] },
  );
  await message.populate([
    { path: 'sender', select: 'name avatar' },
    {
      path: 'replyTo',
      select: 'text type deletedForAll sender',
      populate: { path: 'sender', select: 'name' },
    },
  ]);
  return { message: serializeMessage(message), reused: false };
};

const sendTextMessage = async ({ userId, conversationId, text, replyTo, clientMessageId }) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const recipientIds = await ensureCanSend(conversation, userId);
  return saveMessage({
    userId,
    conversation,
    recipientIds,
    text,
    replyTo,
    type: 'text',
    clientMessageId,
  });
};

const saveMediaMessage = async ({
  userId,
  conversationId,
  text,
  replyTo,
  type,
  media,
  clientMessageId,
}) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const recipientIds = await ensureCanSend(conversation, userId);
  return saveMessage({
    userId,
    conversation,
    recipientIds,
    text,
    replyTo,
    type,
    media,
    clientMessageId,
  });
};

const editMessage = async (userId, messageId, text) => {
  if (!mongoose.isValidObjectId(messageId)) throw messageError();
  const message = await Message.findOne({
    _id: messageId,
    deletedFor: { $ne: userId },
    deletedForAll: false,
  });
  if (!message || message.deletedForAll || message.type !== 'text') throw messageError();
  const { conversation } = await getConversationForUser(message.conversationId, userId);
  await ensureCanSend(conversation, userId);
  if (message.sender?.toString() !== userId.toString()) {
    throw new AppError(403, 'MESSAGE_EDIT_FORBIDDEN', 'Only the sender can edit this message');
  }
  if (Date.now() - message.createdAt.getTime() > 15 * 60_000) {
    throw new AppError(
      409,
      'MESSAGE_EDIT_WINDOW_EXPIRED',
      'Messages can only be edited for 15 minutes',
    );
  }
  message.text = text;
  message.editedAt = new Date();
  await message.save();
  await message.populate('sender', 'name avatar');
  const serialized = serializeMessage(message);
  await Conversation.updateOne(
    { _id: conversation._id, 'lastMessage.messageId': message._id },
    { $set: { 'lastMessage.preview': text.slice(0, 200) } },
  );
  return { message: serialized, conversationId: conversation._id.toString() };
};

const forwardMessage = async (userId, messageId, targetConversationId) => {
  if (!mongoose.isValidObjectId(messageId)) throw messageError();
  const source = await Message.findById(messageId);
  if (!source || source.deletedForAll || source.type === 'system') throw messageError();
  await getConversationForUser(source.conversationId, userId);
  if (source.deletedFor.some((id) => id.toString() === userId.toString())) throw messageError();
  const { conversation: target } = await getConversationForUser(targetConversationId, userId);
  const recipientIds = await ensureCanSend(target, userId);
  const result = await saveMessage({
    userId,
    conversation: target,
    recipientIds,
    text: source.text,
    media: source.media,
    type: source.type,
    forwardedFrom: source.forwardedFrom || source._id,
  });
  return { ...result, conversationId: target._id.toString() };
};

const toggleMessageReaction = async (userId, messageId, emoji) => {
  if (!mongoose.isValidObjectId(messageId)) throw messageError();
  const message = await Message.findOne({
    _id: messageId,
    deletedFor: { $ne: userId },
    deletedForAll: false,
  });
  if (!message) throw messageError();
  const { conversation } = await getConversationForUser(message.conversationId, userId);
  const previous = message.reactions.find(
    (reaction) => reaction.userId.toString() === userId.toString(),
  );
  const removed = previous?.emoji === emoji;
  if (previous) message.reactions = message.reactions.filter((reaction) => reaction !== previous);
  if (!removed) message.reactions.push({ userId, emoji });
  await message.save();
  await message.populate('sender', 'name avatar');
  return {
    message: serializeMessage(message),
    conversationId: conversation._id.toString(),
  };
};

const toggleStarMessage = async (userId, messageId) => {
  if (!mongoose.isValidObjectId(messageId)) throw messageError();
  const message = await Message.findOne({
    _id: messageId,
    deletedFor: { $ne: userId },
    deletedForAll: false,
  });
  if (!message) throw messageError();
  await getConversationForUser(message.conversationId, userId);
  const starred = message.starredBy.some((id) => id.toString() === userId.toString());
  await Message.updateOne(
    { _id: message._id },
    starred ? { $pull: { starredBy: userId } } : { $addToSet: { starredBy: userId } },
  );
  return { starred: !starred };
};

const getStarredMessages = async (userId) => {
  const messages = await Message.find({
    starredBy: userId,
    deletedFor: { $ne: userId },
    deletedForAll: false,
  })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(100)
    .populate('sender', 'name avatar');
  const visible = [];
  for (const message of messages) {
    try {
      await getConversationForUser(message.conversationId, userId);
      visible.push(serializeMessage(message));
    } catch (error) {
      if (error.statusCode !== 404 && error.code !== 'CHAT_BLOCKED') throw error;
    }
  }
  return visible;
};

const searchMessages = async (userId, conversationId, query) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const messages = await Message.find({
    conversationId: conversation._id,
    $text: { $search: query },
    deletedFor: { $ne: userId },
    deletedForAll: false,
  })
    .select({ score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
    .limit(SEARCH_PAGE_SIZE)
    .populate('sender', 'name avatar');
  return messages.map(serializeMessage);
};

const pinMessage = async (userId, conversationId, messageId) => {
  if (!mongoose.isValidObjectId(messageId)) throw messageError();
  const { conversation } = await getConversationForUser(conversationId, userId);
  const message = await Message.findOne({
    _id: messageId,
    conversationId: conversation._id,
    deletedFor: { $ne: userId },
    deletedForAll: false,
  });
  if (!message) throw messageError();
  if (conversation.pinnedMessages.some((pin) => pin.messageId.toString() === messageId)) {
    return getPinnedMessages(userId, conversationId);
  }
  if (conversation.pinnedMessages.length >= MAX_PINNED_MESSAGES) {
    throw new AppError(
      409,
      'PIN_LIMIT_REACHED',
      'A conversation can have at most 20 pinned messages',
    );
  }
  conversation.pinnedMessages.push({ messageId, pinnedBy: userId });
  await conversation.save();
  return getPinnedMessages(userId, conversationId);
};

const unpinMessage = async (userId, conversationId, messageId) => {
  if (!mongoose.isValidObjectId(messageId)) throw messageError();
  const { conversation } = await getConversationForUser(conversationId, userId);
  const originalCount = conversation.pinnedMessages.length;
  conversation.pinnedMessages = conversation.pinnedMessages.filter(
    (pin) => pin.messageId.toString() !== messageId,
  );
  if (conversation.pinnedMessages.length === originalCount) {
    throw new AppError(404, 'PIN_NOT_FOUND', 'Pinned message not found');
  }
  await conversation.save();
  return getPinnedMessages(userId, conversationId);
};

const getPinnedMessages = async (userId, conversationId) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const messageIds = conversation.pinnedMessages.map((pin) => pin.messageId);
  const messages = await Message.find({
    _id: { $in: messageIds },
    conversationId: conversation._id,
    deletedFor: { $ne: userId },
    deletedForAll: false,
  })
    .populate('sender', 'name avatar')
    .sort({ createdAt: -1 });
  return messages.map(serializeMessage);
};

const markDelivered = async (userId, conversationId) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const now = new Date();
  const result = await Message.updateMany(
    {
      conversationId: conversation._id,
      sender: { $ne: userId },
      receipts: { $elemMatch: { userId, deliveredAt: null } },
    },
    {
      $set: {
        'receipts.$[receipt].deliveredAt': now,
        status: 'delivered',
      },
    },
    { arrayFilters: [{ 'receipt.userId': userId, 'receipt.deliveredAt': null }] },
  );
  return { count: result.modifiedCount, at: now };
};

const markSeen = async (userId, conversationId) => {
  const { conversation } = await getConversationForUser(conversationId, userId);
  const now = new Date();
  const user = await User.findById(userId).select('privacy.readReceipts');
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  if (user.privacy?.readReceipts === false) {
    await Conversation.updateOne(
      { _id: conversation._id, 'participants.userId': userId },
      {
        $set: {
          'participants.$.unreadCount': 0,
          'participants.$.lastReadAt': now,
        },
      },
    );
    return { count: 0, at: now, readReceiptsDisabled: true };
  }
  const result = await Message.updateMany(
    {
      conversationId: conversation._id,
      sender: { $ne: userId },
      receipts: { $elemMatch: { userId, readAt: null } },
    },
    {
      $set: {
        'receipts.$[receipt].deliveredAt': now,
        'receipts.$[receipt].readAt': now,
        status: 'seen',
      },
    },
    { arrayFilters: [{ 'receipt.userId': userId, 'receipt.readAt': null }] },
  );
  await Conversation.updateOne(
    { _id: conversation._id, 'participants.userId': userId },
    {
      $set: {
        'participants.$.unreadCount': 0,
        'participants.$.lastReadAt': now,
      },
    },
  );
  return { count: result.modifiedCount, at: now };
};

const deleteMessage = async (userId, messageId, scope) => {
  if (!mongoose.isValidObjectId(messageId) || !['me', 'all'].includes(scope)) {
    throw new AppError(400, 'INVALID_DELETE_REQUEST', 'Choose a valid message and delete scope');
  }
  const message = await Message.findById(messageId);
  if (!message) throw messageError();
  const { conversation, otherUserId } = await getConversationForUser(
    message.conversationId,
    userId,
  );
  const deletedMedia = scope === 'all' ? message.media?.toObject?.() || message.media : null;
  if (scope === 'all') {
    if (message.sender?.toString() !== userId.toString()) {
      throw new AppError(
        403,
        'MESSAGE_DELETE_FORBIDDEN',
        'Only the sender can delete this for all',
      );
    }
    message.deletedForAll = true;
    message.text = '';
    message.media = null;
  } else if (!message.deletedFor.some((id) => id.toString() === userId.toString())) {
    message.deletedFor.push(userId);
  }
  await message.save();
  if (
    deletedMedia?.publicId &&
    (await Message.exists({ 'media.publicId': deletedMedia.publicId }))
  ) {
    deletedMedia.publicId = null;
  }
  if (scope === 'all') {
    await Conversation.updateOne(
      { _id: conversation._id },
      { $pull: { pinnedMessages: { messageId: message._id } } },
    );
  }
  if (scope === 'all') {
    const unreadRecipientIds = message.receipts
      .filter((receipt) => !receipt.readAt)
      .map((receipt) => receipt.userId);
    if (
      otherUserId &&
      !message.receipts.some((receipt) => receipt.userId.toString() === otherUserId.toString())
    ) {
      unreadRecipientIds.push(otherUserId);
    }
    for (const recipientId of unreadRecipientIds) {
      const unreadCount = await Message.countDocuments({
        conversationId: conversation._id,
        sender: { $ne: recipientId },
        receipts: { $elemMatch: { userId: recipientId, readAt: null } },
        deletedFor: { $ne: recipientId },
        deletedForAll: false,
      });
      await Conversation.updateOne(
        { _id: conversation._id, 'participants.userId': recipientId },
        { $set: { 'participants.$.unreadCount': unreadCount } },
      );
    }
    await Conversation.updateOne(
      { _id: conversation._id, 'lastMessage.messageId': message._id },
      { $set: { 'lastMessage.preview': 'Message deleted', 'lastMessage.type': 'system' } },
    );
  } else if (
    message.sender?.toString() !== userId.toString() &&
    message.receipts.some(
      (receipt) => receipt.userId.toString() === userId.toString() && !receipt.readAt,
    )
  ) {
    const unreadCount = await Message.countDocuments({
      conversationId: conversation._id,
      sender: { $ne: userId },
      receipts: { $elemMatch: { userId, readAt: null } },
      deletedFor: { $ne: userId },
      deletedForAll: false,
    });
    await Conversation.updateOne(
      { _id: conversation._id, 'participants.userId': userId },
      { $set: { 'participants.$.unreadCount': unreadCount } },
    );
  }
  await message.populate('sender', 'name avatar');
  return {
    message: serializeMessage(message),
    conversationId: conversation._id.toString(),
    deletedMedia,
  };
};

module.exports = {
  createOrGetDirectConversation,
  authorizeDirectMessage,
  deleteMessage,
  editMessage,
  forwardMessage,
  getConversationForUser,
  getConversationList,
  getMessageHistory,
  getPinnedMessages,
  getStarredMessages,
  markDelivered,
  markSeen,
  pinMessage,
  searchMessages,
  saveMediaMessage,
  serializeMessage,
  sendTextMessage,
  toggleMessageReaction,
  toggleStarMessage,
  unpinMessage,
};
