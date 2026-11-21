const { z } = require('zod');
const { objectId } = require('../validators/chatSchemas');
const meetingService = require('../services/meetingService');
const { getMeetingAccess, meetingError } = require('../services/meetingAccess');

const meetingIdSchema = z.object({ meetingId: objectId }).strict();

const reportSocketError = (acknowledge, error) => {
  if (!(error && error.statusCode)) {
    console.error('Meeting socket event failed', error);
  }
  if (typeof acknowledge === 'function') {
    acknowledge({
      error: {
        code: error.code || 'MEETING_EVENT_FAILED',
        message: error.statusCode ? error.message : 'Could not complete the meeting action',
      },
    });
  }
};

const attachMeetingSocket = (io, socket) => {
  const userId = socket.data.user._id;

  socket.on('meeting:join', async (payload, acknowledge) => {
    try {
      const parsed = meetingIdSchema.safeParse(payload);
      if (!parsed.success) {
        throw meetingError(400, 'INVALID_MEETING_ID', 'A valid meeting ID is required');
      }
      const { meeting, access } = await getMeetingAccess({
        meetingId: parsed.data.meetingId,
        userId,
      });
      if (access.status === 'ended') {
        throw meetingError(409, 'MEETING_ENDED', 'Meeting has ended');
      }
      if (access.status === 'waiting') {
        if (typeof acknowledge === 'function') {
          acknowledge({
            data: { joined: false, waitingForStart: true, startTime: meeting.startTime },
          });
        }
        return;
      }
      if (access.status !== 'allowed') {
        throw meetingError(403, 'MEETING_ACCESS_DENIED', 'You cannot join this meeting room');
      }
      await socket.join(`meeting:${meeting._id}`);
      if (typeof acknowledge === 'function') acknowledge({ data: { joined: true } });
    } catch (error) {
      reportSocketError(acknowledge, error);
    }
  });

  socket.on('meeting:room-joined', async (payload, acknowledge) => {
    try {
      const parsed = meetingIdSchema.safeParse(payload);
      if (!parsed.success) {
        throw meetingError(400, 'INVALID_MEETING_ID', 'A valid meeting ID is required');
      }
      if (!socket.rooms.has(`meeting:${parsed.data.meetingId}`)) {
        throw meetingError(403, 'MEETING_ROOM_REQUIRED', 'Join the meeting room first');
      }
      const result = await meetingService.markRoomJoined(parsed.data.meetingId, userId, io);
      io.to(`meeting:${result.meetingId}`).emit('meeting:participant-joined', {
        meetingId: result.meetingId,
        user: {
          id: userId.toString(),
          name: socket.data.user.name,
          avatar: socket.data.user.avatar,
        },
      });
      if (typeof acknowledge === 'function') acknowledge({ data: result });
    } catch (error) {
      reportSocketError(acknowledge, error);
    }
  });

  socket.on('meeting:leave', (payload, acknowledge) => {
    const parsed = meetingIdSchema.safeParse(payload);
    if (!parsed.success) {
      reportSocketError(
        acknowledge,
        meetingError(400, 'INVALID_MEETING_ID', 'A valid meeting ID is required'),
      );
      return;
    }
    void socket.leave(`meeting:${parsed.data.meetingId}`);
    if (typeof acknowledge === 'function') acknowledge({ data: { left: true } });
  });

  socket.on('meeting:raise-hand', async (payload, acknowledge) => {
    try {
      const parsed = meetingIdSchema.safeParse(payload);
      if (!parsed.success) {
        throw meetingError(400, 'INVALID_MEETING_ID', 'A valid meeting ID is required');
      }
      const { meeting, access } = await getMeetingAccess({
        meetingId: parsed.data.meetingId,
        userId,
      });
      if (access.status !== 'allowed') {
        throw meetingError(403, 'MEETING_ACCESS_DENIED', 'You cannot participate in this meeting');
      }
      if (!socket.rooms.has(`meeting:${meeting._id}`)) {
        throw meetingError(403, 'MEETING_ROOM_REQUIRED', 'Join the meeting room first');
      }
      io.to(`meeting:${meeting._id}`).emit('meeting:hand-raised', {
        meetingId: meeting._id.toString(),
        userId: userId.toString(),
        name: socket.data.user.name,
      });
      if (typeof acknowledge === 'function') acknowledge({ data: { raised: true } });
    } catch (error) {
      reportSocketError(acknowledge, error);
    }
  });

  socket.on('meeting:reaction', async (payload, acknowledge) => {
    try {
      const parsed = z
        .object({ meetingId: objectId, emoji: z.enum(['👏', '❤️', '😂', '🎉', '👍']) })
        .strict()
        .safeParse(payload);
      if (!parsed.success) {
        throw meetingError(400, 'INVALID_MEETING_REACTION', 'Choose a supported meeting reaction');
      }
      const { meeting, access } = await getMeetingAccess({
        meetingId: parsed.data.meetingId,
        userId,
      });
      if (access.status !== 'allowed') {
        throw meetingError(403, 'MEETING_ACCESS_DENIED', 'You cannot participate in this meeting');
      }
      if (!socket.rooms.has(`meeting:${meeting._id}`)) {
        throw meetingError(403, 'MEETING_ROOM_REQUIRED', 'Join the meeting room first');
      }
      io.to(`meeting:${meeting._id}`).emit('meeting:reaction', {
        meetingId: meeting._id.toString(),
        userId: userId.toString(),
        name: socket.data.user.name,
        emoji: parsed.data.emoji,
      });
      if (typeof acknowledge === 'function') acknowledge({ data: { sent: true } });
    } catch (error) {
      reportSocketError(acknowledge, error);
    }
  });
};

module.exports = attachMeetingSocket;
