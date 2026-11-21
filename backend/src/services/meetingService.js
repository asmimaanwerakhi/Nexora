const mongoose = require('mongoose');
const Meeting = require('../models/meeting');
const MeetingJoinRequest = require('../models/meetingJoinRequest');
const User = require('../models/user');
const livekitService = require('./livekitService');
const reminderService = require('./meetingReminderService');
const {
  getJoinAccess,
  getMeeting,
  getMeetingAccess,
  meetingError,
  requireHost,
} = require('./meetingAccess');

const publicUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  username: user.username || null,
  avatar: user.avatar || null,
});

const getUserId = (userId) => (userId?._id ? userId._id.toString() : userId.toString());

const meetingDto = (meeting, userId, access = null, request = null) => ({
  id: meeting._id.toString(),
  title: meeting.title,
  description: meeting.description,
  host: meeting.hostId?._id ? publicUser(meeting.hostId) : { id: getUserId(meeting.hostId) },
  startTime: meeting.startTime,
  endTime: new Date(meeting.startTime.getTime() + meeting.durationMinutes * 60_000),
  durationMinutes: meeting.durationMinutes,
  timezone: meeting.timezone,
  accessType: meeting.accessType,
  allowLinkRequests: meeting.allowLinkRequests,
  allowEarlyJoin: meeting.allowEarlyJoin,
  earlyJoinMinutes: meeting.earlyJoinMinutes,
  invitedUsers: (meeting.invitedUsers || []).map((invitee) =>
    invitee?._id ? publicUser(invitee) : { id: getUserId(invitee) },
  ),
  meetingLink: meeting.meetingLink,
  url: new URL(
    `/meet/${meeting.meetingLink}`,
    process.env.APP_URL || 'http://localhost:5173',
  ).toString(),
  status: meeting.status,
  isHost: meeting.hostId._id
    ? meeting.hostId._id.toString() === userId.toString()
    : meeting.hostId.toString() === userId.toString(),
  accessStatus: access?.status || null,
  request: request
    ? {
        id: request._id?.toString(),
        status: request.status,
        rejectionCount: request.rejectionCount,
        requestedAt: request.requestedAt,
      }
    : null,
  createdAt: meeting.createdAt,
  updatedAt: meeting.updatedAt,
});

const emitToUsers = (io, userIds, event, payload) => {
  for (const userId of new Set(userIds.map((id) => id.toString()))) {
    io?.to(`user:${userId}`).emit(event, payload);
  }
};

const getMeetingRecipientIds = async (meeting) => {
  const acceptedRequests = await MeetingJoinRequest.find({
    meetingId: meeting._id,
    status: 'accepted',
  }).select('userId');
  return [
    ...new Set([
      meeting.hostId.toString(),
      ...meeting.invitedUsers.map((userId) => userId.toString()),
      ...acceptedRequests.map((request) => request.userId.toString()),
    ]),
  ];
};

const notifyInvitees = (io, meeting, userIds) => {
  const payload = {
    meetingId: meeting._id.toString(),
    title: meeting.title,
    startTime: meeting.startTime,
    meetingLink: meeting.meetingLink,
    url: meetingDto(meeting, meeting.hostId).url,
  };
  emitToUsers(io, userIds, 'meeting:invited', payload);
  const { sendMeetingPush } = require('./pushService');
  for (const recipientId of userIds) {
    void sendMeetingPush({
      recipientId,
      title: 'Meeting invitation',
      body: meeting.title,
      meetingLink: meeting.meetingLink,
    }).catch((error) =>
      console.error(`Could not send meeting invitation to ${recipientId}`, error),
    );
  }
};

const ensureInviteesExist = async (inviteeIds, hostId) => {
  if (inviteeIds.some((userId) => userId.toString() === hostId.toString())) {
    throw meetingError(400, 'INVALID_MEETING_INVITEES', 'You are already the meeting host');
  }
  if (!inviteeIds.length) return;
  const users = await User.find({ _id: { $in: inviteeIds }, isVerified: true }).select('_id');
  if (users.length !== inviteeIds.length) {
    throw meetingError(400, 'INVALID_MEETING_INVITEES', 'Invite only existing verified users');
  }
};

const populateMeeting = (query) => query.populate('hostId invitedUsers', 'name username avatar');

const createMeeting = async (hostId, values, io) => {
  if (values.startTime <= new Date()) {
    throw meetingError(400, 'INVALID_MEETING_START', 'Meeting start time must be in the future');
  }
  await ensureInviteesExist(values.invitedUsers, hostId);
  const meeting = await Meeting.create({
    ...values,
    hostId,
    allowLinkRequests: values.accessType === 'link' && values.allowLinkRequests,
    invitedUsers: values.invitedUsers,
  });
  await reminderService.scheduleMeeting(meeting);
  if (meeting.invitedUsers.length) notifyInvitees(io, meeting, meeting.invitedUsers);
  const populated = await populateMeeting(Meeting.findById(meeting._id));
  return meetingDto(populated, hostId);
};

const listMeetings = async (userId) => {
  const acceptedRequests = await MeetingJoinRequest.find({ userId, status: 'accepted' }).select(
    'meetingId',
  );
  const meetingIds = acceptedRequests.map((request) => request.meetingId);
  const meetings = await populateMeeting(
    Meeting.find({
      $or: [{ hostId: userId }, { invitedUsers: userId }, { _id: { $in: meetingIds } }],
    }).sort({ startTime: 1, _id: 1 }),
  ).limit(100);
  return meetings
    .filter(
      (meeting) =>
        !meeting.removedUsers.some(
          (removedUserId) => removedUserId.toString() === userId.toString(),
        ),
    )
    .map((meeting) => meetingDto(meeting, userId));
};

const getMeetingDetails = async (meeting, userId, allowLinkVisitor = false) => {
  const access = await getJoinAccess(meeting, userId);
  if (!allowLinkVisitor && ['private', 'request_required', 'removed'].includes(access.status)) {
    throw meetingError(403, 'MEETING_PRIVATE', 'This meeting is private');
  }
  const populated = await populateMeeting(Meeting.findById(meeting._id));
  return meetingDto(populated, userId, access, access.request);
};

const getMeetingById = async (meetingId, userId) => {
  if (!mongoose.isValidObjectId(meetingId)) {
    throw meetingError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
  }
  const meeting = await getMeeting({ meetingId });
  return getMeetingDetails(meeting, userId);
};

const getMeetingByLink = async (meetingLink, userId) => {
  const { meeting, access } = await getMeetingAccess({ meetingLink, userId });
  const populated = await populateMeeting(Meeting.findById(meeting._id));
  return meetingDto(populated, userId, access, access.request);
};

const emitPendingCancelled = async (io, meeting, status = 'cancelled') => {
  const pending = await MeetingJoinRequest.find({
    meetingId: meeting._id,
    status: 'pending',
  }).select('userId');
  if (!pending.length) return;
  await MeetingJoinRequest.updateMany(
    { meetingId: meeting._id, status: 'pending' },
    { $set: { status, decidedAt: new Date() } },
  );
  emitToUsers(
    io,
    pending.map((request) => request.userId),
    'meeting:request-decision',
    {
      meetingId: meeting._id.toString(),
      status,
      message: 'The meeting host closed join requests.',
    },
  );
};

const updateMeeting = async (meetingId, hostId, changes, io) => {
  const meeting = await getMeeting({ meetingId });
  requireHost(meeting, hostId);
  if (meeting.status !== 'scheduled') {
    throw meetingError(409, 'MEETING_NOT_EDITABLE', 'Only scheduled meetings can be edited');
  }
  if (changes.startTime && changes.startTime <= new Date()) {
    throw meetingError(400, 'INVALID_MEETING_START', 'Meeting start time must be in the future');
  }
  const newInvitees = changes.invitedUsers || meeting.invitedUsers.map((id) => id.toString());
  await ensureInviteesExist(newInvitees, hostId);
  const previousInvitees = meeting.invitedUsers.map((id) => id.toString());
  const addedInvitees = newInvitees.filter((id) => !previousInvitees.includes(id));
  Object.assign(meeting, changes);
  if (changes.allowLinkRequests === true && meeting.accessType !== 'link') {
    throw meetingError(400, 'INVALID_MEETING_ACCESS', 'Link join requests require link access');
  }
  if (meeting.accessType !== 'link') meeting.allowLinkRequests = false;
  meeting.removedUsers = meeting.removedUsers.filter(
    (removedUserId) => !addedInvitees.includes(removedUserId.toString()),
  );
  await meeting.save();

  if (!meeting.allowLinkRequests) await emitPendingCancelled(io, meeting);
  const removedInvitees = previousInvitees.filter((id) => !newInvitees.includes(id));
  const acceptedRequests = await MeetingJoinRequest.find({
    meetingId: meeting._id,
    userId: { $in: removedInvitees },
    status: 'accepted',
  }).select('userId');
  const acceptedIds = new Set(acceptedRequests.map((request) => request.userId.toString()));
  const revokedInvitees = removedInvitees.filter((userId) => !acceptedIds.has(userId));
  try {
    await Promise.all(
      revokedInvitees
        .filter(() => livekitService.isConfigured())
        .map((userId) => livekitService.removeParticipantIfPresent(meeting._id, userId)),
    );
  } finally {
    if (revokedInvitees.length) {
      emitToUsers(io, revokedInvitees, 'meeting:access-revoked', {
        meetingId: meeting._id.toString(),
      });
    }
  }
  await reminderService.scheduleMeeting(meeting);
  if (addedInvitees.length) notifyInvitees(io, meeting, addedInvitees);
  const populated = await populateMeeting(Meeting.findById(meeting._id));
  const updatedDto = meetingDto(populated, hostId);
  emitToUsers(
    io,
    [...(await getMeetingRecipientIds(meeting)), ...previousInvitees, hostId],
    'meeting:updated',
    updatedDto,
  );
  return updatedDto;
};

const cancelMeeting = async (meetingId, hostId, io) => {
  const meeting = await getMeeting({ meetingId });
  requireHost(meeting, hostId);
  if (meeting.status === 'cancelled' || meeting.status === 'ended') {
    throw meetingError(409, 'MEETING_ALREADY_CLOSED', 'This meeting has already ended');
  }
  await livekitService.endRoom(meeting._id);
  meeting.status = 'cancelled';
  await meeting.save();
  await reminderService.cancelMeetingJobs(meeting._id);
  await emitPendingCancelled(io, meeting);
  const recipients = await getMeetingRecipientIds(meeting);
  const payload = {
    meetingId: meeting._id.toString(),
    title: meeting.title,
    status: 'cancelled',
    meetingLink: meeting.meetingLink,
  };
  emitToUsers(io, recipients, 'meeting:cancelled', payload);
  return { cancelled: true };
};

const requestToJoin = async (meetingId, userId, io) => {
  const { meeting, access } = await getMeetingAccess({ meetingId, userId });
  if (access.status === 'ended') {
    throw meetingError(409, 'MEETING_ENDED', 'Meeting has ended');
  }
  if (access.status === 'private') {
    throw meetingError(403, 'MEETING_PRIVATE', 'This meeting is private');
  }
  if (access.status === 'removed') {
    throw meetingError(
      403,
      'MEETING_PARTICIPANT_REMOVED',
      'The host removed you from this meeting',
    );
  }
  if (access.status === 'allowed' || access.request?.status === 'accepted') {
    return { status: 'accepted', requestId: access.request?._id?.toString() || null };
  }
  if (access.status !== 'request_required') {
    throw meetingError(
      409,
      'MEETING_NOT_REQUESTABLE',
      'This meeting is not accepting join requests',
    );
  }
  if (access.request?.status === 'pending') {
    throw meetingError(
      409,
      'JOIN_REQUEST_PENDING',
      'Your join request is already waiting for the host',
    );
  }
  if ((access.request?.rejectionCount || 0) >= 3) {
    throw meetingError(
      429,
      'JOIN_REQUEST_BLOCKED',
      'The host has rejected your last three requests',
    );
  }
  let joinRequest;
  if (access.request) {
    joinRequest = await MeetingJoinRequest.findOneAndUpdate(
      { _id: access.request._id, status: { $in: ['rejected', 'cancelled'] } },
      { $set: { status: 'pending', requestedAt: new Date(), decidedAt: null } },
      { new: true },
    );
  } else {
    try {
      joinRequest = await MeetingJoinRequest.create({ meetingId: meeting._id, userId });
    } catch (error) {
      if (error.code !== 11000) throw error;
      throw meetingError(
        409,
        'JOIN_REQUEST_PENDING',
        'Your join request is already waiting for the host',
      );
    }
  }
  if (!joinRequest) {
    throw meetingError(
      409,
      'JOIN_REQUEST_PENDING',
      'Your join request is already waiting for the host',
    );
  }
  const requester = await User.findById(userId).select('name avatar');
  const payload = {
    meetingId: meeting._id.toString(),
    meetingLink: meeting.meetingLink,
    title: meeting.title,
    request: {
      id: joinRequest._id.toString(),
      user: publicUser(requester),
      requestedAt: joinRequest.requestedAt,
    },
  };
  emitToUsers(io, [meeting.hostId], 'meeting:join-request', payload);
  const { sendMeetingPush } = require('./pushService');
  void sendMeetingPush({
    recipientId: meeting.hostId,
    title: 'Meeting join request',
    body: `${requester.name} wants to join ${meeting.title}`,
    meetingLink: meeting.meetingLink,
  }).catch((error) =>
    console.error('Could not send meeting join request push notification', error),
  );
  return { status: 'pending', requestId: joinRequest._id.toString() };
};

const decideJoinRequest = async (meetingId, requestId, hostId, decision, io) => {
  const meeting = await getMeeting({ meetingId });
  requireHost(meeting, hostId);
  if (!mongoose.isValidObjectId(requestId)) {
    throw meetingError(404, 'JOIN_REQUEST_NOT_FOUND', 'This join request is no longer pending');
  }
  if (meeting.status === 'cancelled' || meeting.status === 'ended') {
    throw meetingError(409, 'MEETING_CLOSED', 'This meeting is no longer accepting requests');
  }
  const update =
    decision === 'rejected'
      ? { $set: { status: 'rejected', decidedAt: new Date() }, $inc: { rejectionCount: 1 } }
      : { $set: { status: 'accepted', decidedAt: new Date() } };
  const joinRequest = await MeetingJoinRequest.findOneAndUpdate(
    { _id: requestId, meetingId: meeting._id, status: 'pending' },
    update,
    { new: true },
  );
  if (!joinRequest) {
    throw meetingError(404, 'JOIN_REQUEST_NOT_FOUND', 'This join request is no longer pending');
  }
  const result = {
    meetingId: meeting._id.toString(),
    status: decision,
    rejectionCount: joinRequest.rejectionCount,
    message:
      decision === 'accepted'
        ? 'The host accepted your request.'
        : joinRequest.rejectionCount >= 3
          ? 'The host declined your request. Further requests are blocked.'
          : 'The host declined your request.',
  };
  emitToUsers(io, [joinRequest.userId], 'meeting:request-decision', result);
  return { ...result, requestId: joinRequest._id.toString() };
};

const getJoinRequestStatus = async (meetingId, userId) => {
  const joinRequest = await MeetingJoinRequest.findOne({ meetingId, userId }).select(
    'status rejectionCount requestedAt',
  );
  return joinRequest;
};

const getMeetingToken = async (meetingId, user) => {
  const { meeting, access } = await getMeetingAccess({ meetingId, userId: user._id });
  if (access.status === 'ended') throw meetingError(409, 'MEETING_ENDED', 'Meeting has ended');
  if (access.status === 'private')
    throw meetingError(403, 'MEETING_PRIVATE', 'This meeting is private');
  if (access.status === 'removed') {
    throw meetingError(
      403,
      'MEETING_PARTICIPANT_REMOVED',
      'The host removed you from this meeting',
    );
  }
  if (access.status === 'request_required') {
    throw meetingError(403, 'JOIN_REQUEST_REQUIRED', 'Request to join and wait for the host');
  }
  if (access.status === 'waiting') {
    throw meetingError(409, 'MEETING_NOT_STARTED', 'Meeting has not started yet');
  }
  const token = await livekitService.issueToken({ meeting, user, isHost: access.isHost });
  return { ...token, meetingId: meeting._id.toString(), title: meeting.title };
};

const markRoomJoined = async (meetingId, userId, io) => {
  const { meeting, access } = await getMeetingAccess({ meetingId, userId });
  if (access.status !== 'allowed') {
    throw meetingError(403, 'MEETING_ACCESS_DENIED', 'You cannot join this meeting room');
  }
  if (access.isHost) {
    const updated = await Meeting.findOneAndUpdate(
      { _id: meeting._id, status: 'scheduled' },
      { $set: { status: 'live' } },
      { new: true },
    );
    if (updated) {
      await reminderService.scheduleMeeting(updated);
      emitToUsers(io, await getMeetingRecipientIds(updated), 'meeting:started', {
        meetingId: meeting._id.toString(),
        startTime: meeting.startTime,
      });
    }
    await livekitService.markHostPresent(meeting);
  }
  return {
    meetingId: meeting._id.toString(),
    waitingForHost: !access.isHost && meeting.status !== 'live',
  };
};

const muteParticipant = async (meetingId, hostId, participantId, muted) => {
  const meeting = await getMeeting({ meetingId });
  requireHost(meeting, hostId);
  if (!mongoose.isValidObjectId(participantId)) {
    throw meetingError(
      404,
      'MEETING_PARTICIPANT_NOT_FOUND',
      'This user is not an allowed participant',
    );
  }
  if (meeting.status !== 'live') {
    throw meetingError(
      409,
      'MEETING_NOT_LIVE',
      'Participants can only be controlled during a live meeting',
    );
  }
  if (participantId === hostId.toString()) {
    throw meetingError(400, 'INVALID_MEETING_PARTICIPANT', 'The host cannot mute themselves');
  }
  const access = await getJoinAccess(meeting, participantId);
  if (access.status !== 'allowed') {
    throw meetingError(
      404,
      'MEETING_PARTICIPANT_NOT_FOUND',
      'This user is not an allowed participant',
    );
  }
  await livekitService.updateParticipantMuted(meeting._id, participantId, muted);
  return { participantId, muted };
};

const removeParticipant = async (meetingId, hostId, participantId, io) => {
  const meeting = await getMeeting({ meetingId });
  requireHost(meeting, hostId);
  if (!mongoose.isValidObjectId(participantId)) {
    throw meetingError(
      404,
      'MEETING_PARTICIPANT_NOT_FOUND',
      'This user is not an allowed participant',
    );
  }
  if (meeting.hostId.toString() === participantId) {
    throw meetingError(400, 'INVALID_MEETING_PARTICIPANT', 'The host cannot remove themselves');
  }
  const access = await getJoinAccess(meeting, participantId);
  if (access.status !== 'allowed') {
    throw meetingError(
      404,
      'MEETING_PARTICIPANT_NOT_FOUND',
      'This user is not an allowed participant',
    );
  }
  meeting.removedUsers.addToSet(participantId);
  await meeting.save();
  let connected = false;
  try {
    if (livekitService.isConfigured()) {
      connected = await livekitService.removeParticipantIfPresent(meeting._id, participantId);
    }
  } finally {
    emitToUsers(io, [participantId], 'meeting:participant-removed', {
      meetingId: meeting._id.toString(),
    });
  }
  return { removed: true, connected, participantId };
};

const endMeeting = async (meetingId, hostId, io) => {
  const meeting = await getMeeting({ meetingId });
  requireHost(meeting, hostId);
  if (meeting.status === 'ended' || meeting.status === 'cancelled') {
    throw meetingError(409, 'MEETING_ALREADY_CLOSED', 'This meeting has already ended');
  }
  await livekitService.endRoom(meeting._id);
  meeting.status = 'ended';
  await meeting.save();
  await reminderService.cancelMeetingJobs(meeting._id);
  await emitPendingCancelled(io, meeting);
  const recipients = await getMeetingRecipientIds(meeting);
  emitToUsers(io, recipients, 'meeting:ended', {
    meetingId: meeting._id.toString(),
    title: meeting.title,
  });
  return { ended: true };
};

const extendMeeting = async (meetingId, hostId, minutes, io) => {
  const meeting = await getMeeting({ meetingId });
  requireHost(meeting, hostId);
  if (meeting.status !== 'live') {
    throw meetingError(409, 'MEETING_NOT_LIVE', 'Only live meetings can be extended');
  }
  if (meeting.durationMinutes + minutes > 1440) {
    throw meetingError(400, 'MEETING_DURATION_LIMIT', 'Meeting duration cannot exceed 24 hours');
  }
  meeting.durationMinutes += minutes;
  await meeting.save();
  await reminderService.scheduleMeeting(meeting);
  const endTime = new Date(meeting.startTime.getTime() + meeting.durationMinutes * 60_000);
  const payload = {
    meetingId: meeting._id.toString(),
    durationMinutes: meeting.durationMinutes,
    endTime,
  };
  emitToUsers(io, await getMeetingRecipientIds(meeting), 'meeting:updated', payload);
  return payload;
};

module.exports = {
  cancelMeeting,
  createMeeting,
  decideJoinRequest,
  endMeeting,
  extendMeeting,
  getJoinRequestStatus,
  getMeetingById,
  getMeetingByLink,
  getMeetingToken,
  listMeetings,
  markRoomJoined,
  muteParticipant,
  removeParticipant,
  requestToJoin,
  updateMeeting,
};
