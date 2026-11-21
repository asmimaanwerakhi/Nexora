const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const friendsController = require('../controllers/friendsController');
const { friendRequestSchema } = require('../validators/friendSchemas');

const router = express.Router();
const friendRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/', authenticate, friendsController.listFriends);
router.get('/requests', authenticate, friendsController.listRequests);
router.get('/blocked', authenticate, friendsController.listBlocked);
router.post(
  '/request',
  authenticate,
  friendRequestLimiter,
  validate(friendRequestSchema),
  friendsController.sendRequest,
);
router.post('/requests/:requestId/accept', authenticate, friendsController.acceptRequest);
router.post('/requests/:requestId/reject', authenticate, friendsController.rejectRequest);
router.delete('/requests/:requestId', authenticate, friendsController.cancelRequest);
router.delete('/:friendId', authenticate, friendsController.removeFriend);
router.post('/:friendId/block', authenticate, friendsController.blockUser);
router.delete('/:friendId/block', authenticate, friendsController.unblockUser);

module.exports = router;
