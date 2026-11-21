const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const AppError = require('../utils/AppError');

const roomNameFor = (meetingId) => `meeting-${meetingId.toString()}`;

const isConfigured = () =>
  Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);

const getLiveKitConfig = () => {
  const { LIVEKIT_URL: url, LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret } = process.env;
  if (!url || !apiKey || !apiSecret) {
    throw new AppError(
      503,
      'LIVEKIT_UNAVAILABLE',
      'Group calls are not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
    );
  }
  return { url, apiKey, apiSecret };
};

const createRoomService = () => {
  const { url, apiKey, apiSecret } = getLiveKitConfig();
  return new RoomServiceClient(url, apiKey, apiSecret);
};

const issueToken = async ({ meeting, user, isHost }) => {
  const { url, apiKey, apiSecret } = getLiveKitConfig();
  const roomName = roomNameFor(meeting._id);
  const roomService = new RoomServiceClient(url, apiKey, apiSecret);
  await roomService.createRoom({ name: roomName, emptyTimeout: 300, maxParticipants: 100 });
  const participants = await roomService.listParticipants(roomName);
  if (participants.some((participant) => participant.identity === user._id.toString())) {
    await roomService.removeParticipant(roomName, user._id.toString(), {
      revokeTokenTs: Math.floor(Date.now() / 1000),
    });
  }
  const hostPresent = participants.some(
    (participant) => participant.identity === meeting.hostId.toString(),
  );
  const waitingForHost = !isHost && !hostPresent;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: user._id.toString(),
    name: user.name,
    ttl: `${Math.min(360, Math.max(30, meeting.durationMinutes + 30))}m`,
    attributes: { meetingId: meeting._id.toString(), role: isHost ? 'host' : 'participant' },
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: !waitingForHost,
    canSubscribe: !waitingForHost,
    canPublishData: true,
  });
  return {
    token: await token.toJwt(),
    serverUrl: url,
    roomName,
    waitingForHost,
  };
};

const markHostPresent = async (meeting) => {
  const roomService = createRoomService();
  const roomName = roomNameFor(meeting._id);
  const participants = await roomService.listParticipants(roomName);
  if (!participants.some((participant) => participant.identity === meeting.hostId.toString())) {
    throw new AppError(
      409,
      'MEETING_HOST_NOT_CONNECTED',
      'Join the meeting room before starting it',
    );
  }
  await Promise.all(
    participants
      .filter((participant) => participant.identity !== meeting.hostId.toString())
      .map((participant) =>
        roomService.updateParticipant(roomName, participant.identity, {
          permission: { canPublish: true, canSubscribe: true, canPublishData: true },
        }),
      ),
  );
};

const removeParticipantIfPresent = async (meetingId, userId) => {
  const roomService = createRoomService();
  const roomName = roomNameFor(meetingId);
  const participants = await roomService.listParticipants(roomName);
  if (!participants.some((participant) => participant.identity === userId.toString())) return false;
  await roomService.removeParticipant(roomName, userId.toString());
  return true;
};

const updateParticipantMuted = async (meetingId, userId, muted) => {
  const roomService = createRoomService();
  const roomName = roomNameFor(meetingId);
  const participants = await roomService.listParticipants(roomName);
  if (!participants.some((participant) => participant.identity === userId.toString())) {
    throw new AppError(
      404,
      'MEETING_PARTICIPANT_NOT_FOUND',
      'This user is not in the live meeting',
    );
  }
  return roomService.updateParticipant(roomName, userId.toString(), {
    permission: { canPublish: !muted, canSubscribe: true, canPublishData: true },
  });
};

const endRoom = async (meetingId) => {
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    return false;
  }
  const roomService = createRoomService();
  const roomName = roomNameFor(meetingId);
  const rooms = await roomService.listRooms([roomName]);
  if (!rooms.some((room) => room.name === roomName)) return false;
  await roomService.deleteRoom(roomName);
  return true;
};

module.exports = {
  createRoomService,
  endRoom,
  isConfigured,
  issueToken,
  markHostPresent,
  removeParticipantIfPresent,
  roomNameFor,
  updateParticipantMuted,
};
