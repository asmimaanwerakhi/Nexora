const mongoose = require('mongoose');
const Meeting = require('../models/meeting');
const MeetingJoinRequest = require('../models/meetingJoinRequest');
const AppError = require('../utils/AppError');

const meetingError = (statusCode, code, message) => new AppError(statusCode, code, message);

const getMeeting = async ({ meetingId, meetingLink }) => {
  if (meetingId && !mongoose.isValidObjectId(meetingId)) {
    throw meetingError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
  }
  if (meetingLink && !/^[a-zA-Z0-9_-]{10}$/.test(meetingLink)) {
    throw meetingError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
  }
  const meeting = meetingId
    ? await Meeting.findById(meetingId)
    : await Meeting.findOne({ meetingLink });
  if (!meeting) throw meetingError(404, 'MEETING_NOT_FOUND', 'Meeting not found');
  return meeting;
};

const getJoinAccess = async (meeting, userId) => {
  const now = new Date();
  const endTime = new Date(meeting.startTime.getTime() + meeting.durationMinutes * 60_000);
  if (meeting.status === 'cancelled' || meeting.status === 'ended' || endTime <= now) {
    if (meeting.status !== 'cancelled' && meeting.status !== 'ended') {
      await Meeting.updateOne(
        { _id: meeting._id, status: { $in: ['scheduled', 'live'] } },
        { $set: { status: 'ended' } },
      );
    }
    return {
      status: 'ended',
      isHost: meeting.hostId.toString() === userId.toString(),
      request: null,
      startTime: meeting.startTime,
    };
  }

  const isHost = meeting.hostId.toString() === userId.toString();
  const isRemoved = meeting.removedUsers.some(
    (removedUserId) => removedUserId.toString() === userId.toString(),
  );
  if (!isHost && isRemoved) {
    return {
      status: 'removed',
      isHost: false,
      request: null,
      startTime: meeting.startTime,
    };
  }
  const isInvited = meeting.invitedUsers.some(
    (invitedUserId) => invitedUserId.toString() === userId.toString(),
  );
  const request = await MeetingJoinRequest.findOne({
    meetingId: meeting._id,
    userId,
  }).select('status rejectionCount requestedAt');
  const hasAcceptedRequest = request?.status === 'accepted';
  const canRequest = meeting.accessType === 'link' && meeting.allowLinkRequests;

  if (!isHost && !isInvited && !hasAcceptedRequest) {
    return {
      status: canRequest ? 'request_required' : 'private',
      isHost: false,
      request,
      startTime: meeting.startTime,
    };
  }

  const earlyWindowMinutes = meeting.allowEarlyJoin ? meeting.earlyJoinMinutes : 0;
  const earliestJoin = new Date(meeting.startTime.getTime() - earlyWindowMinutes * 60_000);
  if (now < earliestJoin) {
    return {
      status: 'waiting',
      isHost,
      request,
      startTime: meeting.startTime,
    };
  }

  return {
    status: 'allowed',
    isHost,
    request,
    startTime: meeting.startTime,
  };
};

const getMeetingAccess = async ({ meetingId, meetingLink, userId }) => {
  const meeting = await getMeeting({ meetingId, meetingLink });
  const access = await getJoinAccess(meeting, userId);
  return { meeting, access };
};

const requireHost = (meeting, userId) => {
  if (meeting.hostId.toString() !== userId.toString()) {
    throw meetingError(403, 'MEETING_HOST_REQUIRED', 'Only the meeting host can do this');
  }
};

module.exports = { getJoinAccess, getMeeting, getMeetingAccess, meetingError, requireHost };
