const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const { uploadAvatar, validateAvatarSignature } = require('../middlewares/avatarUpload');
const { uploadMessageFile, validateMessageFile } = require('../middlewares/messageUpload');
const chatController = require('../controllers/chatController');
const {
  createConversationSchema,
  editMessageSchema,
  forwardMessageSchema,
  groupAdminSchema,
  groupInfoSchema,
  groupMemberSchema,
  groupNotificationsSchema,
  groupPermissionsSchema,
  messageSchema,
  reactionSchema,
  uploadMessageSchema,
} = require('../validators/chatSchemas');

const router = express.Router();
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/conversations', authenticate, chatController.getConversations);
router.get('/messages/starred', authenticate, chatController.getStarredMessages);
router.post(
  '/conversations',
  authenticate,
  messageLimiter,
  validate(createConversationSchema),
  chatController.createConversation,
);
router.patch(
  '/conversations/:conversationId',
  authenticate,
  validate(groupInfoSchema),
  chatController.updateGroupInfo,
);
router.post(
  '/conversations/:conversationId/avatar',
  authenticate,
  uploadAvatar.single('avatar'),
  validateAvatarSignature,
  chatController.updateGroupAvatar,
);
router.post(
  '/conversations/:conversationId/members',
  authenticate,
  validate(groupMemberSchema),
  chatController.addGroupMember,
);
router.delete(
  '/conversations/:conversationId/members/:userId',
  authenticate,
  chatController.removeGroupMember,
);
router.post('/conversations/:conversationId/leave', authenticate, chatController.leaveGroup);
router.patch(
  '/conversations/:conversationId/admins/:userId',
  authenticate,
  validate(groupAdminSchema),
  chatController.updateGroupAdmin,
);
router.patch(
  '/conversations/:conversationId/permissions',
  authenticate,
  validate(groupPermissionsSchema),
  chatController.updateGroupPermissions,
);
router.patch(
  '/conversations/:conversationId/notifications',
  authenticate,
  validate(groupNotificationsSchema),
  chatController.updateGroupNotifications,
);
router.get('/conversations/:conversationId/messages', authenticate, chatController.getMessages);
router.get(
  '/conversations/:conversationId/messages/search',
  authenticate,
  chatController.searchMessages,
);
router.get('/conversations/:conversationId/pins', authenticate, chatController.getPinnedMessages);
router.post(
  '/conversations/:conversationId/pins/:messageId',
  authenticate,
  chatController.pinMessage,
);
router.delete(
  '/conversations/:conversationId/pins/:messageId',
  authenticate,
  chatController.unpinMessage,
);
router.post(
  '/messages',
  authenticate,
  messageLimiter,
  validate(messageSchema),
  chatController.sendTextMessage,
);
router.patch(
  '/messages/:messageId',
  authenticate,
  messageLimiter,
  validate(editMessageSchema),
  chatController.editMessage,
);
router.post(
  '/messages/:messageId/forward',
  authenticate,
  messageLimiter,
  validate(forwardMessageSchema),
  chatController.forwardMessage,
);
router.post(
  '/messages/:messageId/reaction',
  authenticate,
  messageLimiter,
  validate(reactionSchema),
  chatController.reactToMessage,
);
router.post(
  '/messages/:messageId/star',
  authenticate,
  messageLimiter,
  chatController.toggleStarMessage,
);
router.post(
  '/messages/upload',
  authenticate,
  messageLimiter,
  uploadMessageFile,
  validate(uploadMessageSchema),
  validateMessageFile,
  chatController.uploadMessage,
);
router.delete('/messages/:messageId', authenticate, messageLimiter, chatController.deleteMessage);

module.exports = router;
