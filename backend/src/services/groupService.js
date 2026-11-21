const { Readable } = require('node:stream');
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
const Block = require('../models/block');
const Conversation = require('../models/conversation');
const Friendship = require('../models/friendship');
const Message = require('../models/message');
const User = require('../models/user');
const AppError = require('../utils/AppError');
const chatService = require('./chatService');

const groupError = (statusCode, code, message) => new AppError(statusCode, code, message);
const isAdmin = (conversation, userId) =>
  conversation.participants.some(
    (participant) =>
      participant.userId.toString() === userId.toString() &&
      ['owner', 'admin'].includes(participant.role),
  );

const getGroupForUser = async (conversationId, userId) => {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw groupError(404, 'GROUP_NOT_FOUND', 'Group not found');
  }
  const conversation = await Conversation.findOne({
    _id: conversationId,
    type: 'group',
    'participants.userId': userId,
  });
  if (!conversation) throw groupError(404, 'GROUP_NOT_FOUND', 'Group not found');
  return conversation;
};

const ensureFriendAndUnblocked = async (actorId, targetId) => {
  const pair = [actorId.toString(), targetId.toString()].sort();
  const [friendship, block, target] = await Promise.all([
    Friendship.exists({ pairLow: pair[0], pairHigh: pair[1], status: 'accepted' }),
    Block.exists({
      $or: [
        { blocker: actorId, blocked: targetId },
        { blocker: targetId, blocked: actorId },
      ],
    }),
    User.exists({ _id: targetId }),
  ]);
  if (!target) throw groupError(404, 'USER_NOT_FOUND', 'User not found');
  if (block)
    throw groupError(403, 'GROUP_MEMBER_BLOCKED', 'This user cannot be added to the group');
  if (!friendship) {
    throw groupError(403, 'FRIENDSHIP_REQUIRED', 'You can only add accepted friends to a group');
  }
};

const saveSystemMessage = async (conversation, text, actorId) => {
  const recipients = conversation.participants
    .map((participant) => participant.userId)
    .filter((userId) => userId.toString() !== actorId.toString());
  const message = await Message.create({
    conversationId: conversation._id,
    sender: null,
    type: 'system',
    text,
    receipts: recipients.map((userId) => ({ userId })),
  });
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: {
          messageId: message._id,
          senderId: actorId,
          preview: text.slice(0, 200),
          type: 'system',
          sentAt: message.createdAt,
        },
      },
      ...(recipients.length ? { $inc: { 'participants.$[recipient].unreadCount': 1 } } : {}),
    },
    recipients.length ? { arrayFilters: [{ 'recipient.userId': { $in: recipients } }] } : {},
  );
  return chatService.serializeMessage(message);
};

const createGroup = async (ownerId, { name, description = '', participantIds }) => {
  const uniqueIds = [...new Set(participantIds.map((id) => id.toString()))];
  if (uniqueIds.length !== participantIds.length || uniqueIds.includes(ownerId.toString())) {
    throw groupError(400, 'INVALID_GROUP_MEMBERS', 'Choose unique members other than yourself');
  }
  await Promise.all(uniqueIds.map((userId) => ensureFriendAndUnblocked(ownerId, userId)));
  const owner = await User.findById(ownerId).select('name avatar');
  const members = await User.find({ _id: { $in: uniqueIds } }).select('_id name avatar');
  if (members.length !== uniqueIds.length) {
    throw groupError(404, 'USER_NOT_FOUND', 'One or more selected users could not be found');
  }
  const conversation = await Conversation.create({
    type: 'group',
    name,
    description,
    participants: [
      { userId: ownerId, role: 'owner' },
      ...uniqueIds.map((userId) => ({ userId, role: 'member' })),
    ],
  });
  await conversation.populate('participants.userId', 'name username avatar isOnline lastSeen');
  return { conversation, owner };
};

const addMember = async (conversationId, actorId, userId) => {
  const conversation = await getGroupForUser(conversationId, actorId);
  const actor = conversation.participants.find(
    (participant) => participant.userId.toString() === actorId.toString(),
  );
  if (conversation.permissions.adminsOnlyAddMembers && !['owner', 'admin'].includes(actor.role)) {
    throw groupError(403, 'GROUP_ADD_FORBIDDEN', 'Only group admins can add members');
  }
  if (conversation.participants.some((participant) => participant.userId.toString() === userId)) {
    throw groupError(409, 'GROUP_MEMBER_EXISTS', 'This user is already in the group');
  }
  await ensureFriendAndUnblocked(actorId, userId);
  conversation.participants.push({ userId, role: 'member' });
  await conversation.save();
  const [member, actorUser] = await Promise.all([
    User.findById(userId).select('name avatar'),
    User.findById(actorId).select('name avatar'),
  ]);
  const message = await saveSystemMessage(
    conversation,
    `${actorUser.name} added ${member.name}`,
    actorId,
  );
  await conversation.populate('participants.userId', 'name username avatar isOnline lastSeen');
  return { conversation, message, member };
};

const removeMember = async (conversationId, actorId, userId) => {
  const conversation = await getGroupForUser(conversationId, actorId);
  if (!isAdmin(conversation, actorId)) {
    throw groupError(403, 'GROUP_ADMIN_REQUIRED', 'Only group admins can remove members');
  }
  const target = conversation.participants.find(
    (participant) => participant.userId.toString() === userId,
  );
  if (!target) throw groupError(404, 'GROUP_MEMBER_NOT_FOUND', 'Group member not found');
  if (target.role === 'owner') {
    throw groupError(403, 'GROUP_OWNER_PROTECTED', 'The group owner cannot be removed');
  }
  const [removedUser, actor] = await Promise.all([
    User.findById(userId).select('name avatar'),
    User.findById(actorId).select('name avatar'),
  ]);
  conversation.participants = conversation.participants.filter(
    (participant) => participant.userId.toString() !== userId,
  );
  await conversation.save();
  const message = await saveSystemMessage(
    conversation,
    `${actor.name} removed ${removedUser.name}`,
    actorId,
  );
  await conversation.populate('participants.userId', 'name username avatar isOnline lastSeen');
  return { conversation, message, removedUser };
};

const leaveGroup = async (conversationId, userId) => {
  const conversation = await getGroupForUser(conversationId, userId);
  if (conversation.participants.length === 1) {
    throw groupError(409, 'GROUP_LAST_MEMBER', 'The last group member cannot leave');
  }
  const leavingParticipant = conversation.participants.find(
    (participant) => participant.userId.toString() === userId.toString(),
  );
  const leavingUser = await User.findById(userId).select('name avatar');
  conversation.participants = conversation.participants.filter(
    (participant) => participant.userId.toString() !== userId.toString(),
  );
  if (leavingParticipant.role === 'owner') {
    const nextOwner = [...conversation.participants].sort(
      (first, second) => first.joinedAt - second.joinedAt,
    )[0];
    nextOwner.role = 'owner';
  }
  await conversation.save();
  const message = await saveSystemMessage(
    conversation,
    `${leavingUser.name} left the group`,
    userId,
  );
  await conversation.populate('participants.userId', 'name username avatar isOnline lastSeen');
  return { conversation, message, leavingUser };
};

const setAdminRole = async (conversationId, actorId, userId, role) => {
  const conversation = await getGroupForUser(conversationId, actorId);
  if (!isAdmin(conversation, actorId)) {
    throw groupError(403, 'GROUP_ADMIN_REQUIRED', 'Only group admins can manage administrators');
  }
  const target = conversation.participants.find(
    (participant) => participant.userId.toString() === userId,
  );
  if (!target) throw groupError(404, 'GROUP_MEMBER_NOT_FOUND', 'Group member not found');
  if (target.role === 'owner') {
    throw groupError(403, 'GROUP_OWNER_PROTECTED', 'The group owner role cannot be changed here');
  }
  target.role = role;
  await conversation.save();
  await conversation.populate('participants.userId', 'name username avatar isOnline lastSeen');
  return conversation;
};

const updateGroupInfo = async (conversationId, actorId, changes) => {
  const conversation = await getGroupForUser(conversationId, actorId);
  const actorIsAdmin = isAdmin(conversation, actorId);
  if (conversation.permissions.adminsOnlyEditInfo && !actorIsAdmin) {
    throw groupError(
      403,
      'GROUP_INFO_EDIT_FORBIDDEN',
      'Only group admins can edit group information',
    );
  }
  if (changes.name !== undefined) conversation.name = changes.name;
  if (changes.description !== undefined) conversation.description = changes.description;
  await conversation.save();
  await conversation.populate('participants.userId', 'name username avatar isOnline lastSeen');
  return conversation;
};

const updatePermissions = async (conversationId, actorId, changes) => {
  const conversation = await getGroupForUser(conversationId, actorId);
  if (!isAdmin(conversation, actorId)) {
    throw groupError(403, 'GROUP_ADMIN_REQUIRED', 'Only group admins can change group permissions');
  }
  Object.assign(conversation.permissions, changes);
  await conversation.save();
  await conversation.populate('participants.userId', 'name username avatar isOnline lastSeen');
  return conversation;
};

const updateNotifications = async (conversationId, userId, muted) => {
  const conversation = await getGroupForUser(conversationId, userId);
  const participant = conversation.participants.find(
    (item) => item.userId.toString() === userId.toString(),
  );
  participant.notificationsMuted = muted;
  await conversation.save();
  return { muted };
};

const uploadGroupAvatar = async (conversationId, actorId, file) => {
  const conversation = await Conversation.findOne({
    _id: conversationId,
    type: 'group',
    'participants.userId': actorId,
  }).select('+avatarPublicId');
  if (!conversation) throw groupError(404, 'GROUP_NOT_FOUND', 'Group not found');
  if (conversation.permissions.adminsOnlyEditInfo && !isAdmin(conversation, actorId)) {
    throw groupError(
      403,
      'GROUP_INFO_EDIT_FORBIDDEN',
      'Only group admins can edit group information',
    );
  }
  const {
    CLOUDINARY_CLOUD_NAME: cloudName,
    CLOUDINARY_API_KEY: apiKey,
    CLOUDINARY_API_SECRET: apiSecret,
  } = process.env;
  if (!cloudName || !apiKey || !apiSecret) {
    throw groupError(503, 'AVATAR_STORAGE_NOT_CONFIGURED', 'Avatar storage is not configured');
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'Nexora/group-avatars',
        resource_type: 'image',
        transformation: [{ width: 512, height: 512, crop: 'limit' }],
      },
      (error, result) => {
        if (error) {
          reject(
            groupError(
              502,
              'AVATAR_UPLOAD_FAILED',
              'Could not upload the group image. Please try again',
            ),
          );
          return;
        }
        resolve(result);
      },
    );
    Readable.from([file.buffer]).pipe(stream);
  });
  const previousPublicId = conversation.avatarPublicId;
  try {
    conversation.avatar = uploaded.secure_url;
    conversation.avatarPublicId = uploaded.public_id;
    await conversation.save();
    await conversation.populate('participants.userId', 'name username avatar isOnline lastSeen');
  } catch (error) {
    try {
      await cloudinary.uploader.destroy(uploaded.public_id, { resource_type: 'image' });
    } catch (cleanupError) {
      console.error('Could not clean up an unreferenced group image', cleanupError);
    }
    throw error;
  }
  if (previousPublicId) {
    try {
      const cleanup = await cloudinary.uploader.destroy(previousPublicId, {
        resource_type: 'image',
      });
      if (cleanup.result !== 'ok' && cleanup.result !== 'not found') {
        console.warn(
          'Cloudinary returned an unexpected group avatar cleanup status',
          cleanup.result,
        );
      }
    } catch (error) {
      console.warn('Could not remove the previous group avatar from Cloudinary', error);
    }
  }
  return conversation;
};

module.exports = {
  addMember,
  createGroup,
  getGroupForUser,
  leaveGroup,
  removeMember,
  saveSystemMessage,
  setAdminRole,
  updateGroupInfo,
  updateNotifications,
  updatePermissions,
  uploadGroupAvatar,
};
