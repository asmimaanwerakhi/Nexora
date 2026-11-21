const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middlewares/authenticate');
const {
  uploadAvatar,
  uploadCoverPhoto,
  validateAvatarSignature,
  validateCoverPhotoSignature,
} = require('../middlewares/avatarUpload');
const validate = require('../middlewares/validate');
const authController = require('../controllers/authController');
const chatController = require('../controllers/chatController');
const { preferencesSchema, profileSchema } = require('../validators/authSchemas');
const { pushTokenSchema } = require('../validators/chatSchemas');
const friendsController = require('../controllers/friendsController');

const router = express.Router();
const userSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/search', authenticate, userSearchLimiter, friendsController.searchUsers);
router.get(
  '/profile/:profileSlug',
  authenticate,
  userSearchLimiter,
  friendsController.getPublicProfile,
);
router.get('/me', authenticate, authController.getProfile);
router.patch('/me', authenticate, validate(profileSchema), authController.updateProfile);
router.patch(
  '/me/preferences',
  authenticate,
  validate(preferencesSchema),
  authController.updatePreferences,
);
router.post(
  '/me/avatar',
  authenticate,
  uploadAvatar.single('avatar'),
  validateAvatarSignature,
  authController.uploadAvatar,
);
router.post(
  '/me/cover-photo',
  authenticate,
  uploadCoverPhoto.single('coverPhoto'),
  validateCoverPhotoSignature,
  authController.uploadCoverPhoto,
);
router.post(
  '/me/push-token',
  authenticate,
  validate(pushTokenSchema),
  chatController.updatePushToken,
);
router.delete(
  '/me/push-token',
  authenticate,
  validate(pushTokenSchema),
  chatController.removePushToken,
);

module.exports = router;
