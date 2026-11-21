const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middlewares/authenticate');
const validate = require('../middlewares/validate');
const meetingController = require('../controllers/meetingController');
const {
  createMeetingSchema,
  decisionSchema,
  extendMeetingSchema,
  joinRequestSchema,
  muteParticipantSchema,
  updateMeetingSchema,
} = require('../validators/meetingSchemas');

const router = express.Router();
const meetingLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const joinRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(authenticate);
router.get('/', meetingController.listMeetings);
router.post('/', meetingLimiter, validate(createMeetingSchema), meetingController.createMeeting);
router.get('/link/:meetingLink', meetingController.getMeetingByLink);
router.get('/:meetingId', meetingController.getMeetingById);
router.patch(
  '/:meetingId',
  meetingLimiter,
  validate(updateMeetingSchema),
  meetingController.updateMeeting,
);
router.delete('/:meetingId', meetingController.cancelMeeting);
router.post(
  '/:meetingId/request',
  joinRequestLimiter,
  validate(joinRequestSchema),
  meetingController.requestToJoin,
);
router.post(
  '/:meetingId/requests/:requestId/decision',
  validate(decisionSchema),
  meetingController.decideJoinRequest,
);
router.post('/:meetingId/token', meetingLimiter, meetingController.getMeetingToken);
router.patch(
  '/:meetingId/participants/:userId/mute',
  validate(muteParticipantSchema),
  meetingController.muteParticipant,
);
router.delete('/:meetingId/participants/:userId', meetingController.removeParticipant);
router.post('/:meetingId/end', meetingController.endMeeting);
router.post('/:meetingId/extend', validate(extendMeetingSchema), meetingController.extendMeeting);

module.exports = router;
