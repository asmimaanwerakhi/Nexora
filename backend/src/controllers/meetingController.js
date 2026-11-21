const meetingService = require('../services/meetingService');

const getIo = (req) => req.app.get('io');

const createMeeting = async (req, res) => {
  const meeting = await meetingService.createMeeting(req.user._id, req.validatedBody, getIo(req));
  res.status(201).json({ data: { meeting } });
};

const listMeetings = async (req, res) => {
  const meetings = await meetingService.listMeetings(req.user._id);
  res.status(200).json({ data: { meetings } });
};

const getMeetingById = async (req, res) => {
  const meeting = await meetingService.getMeetingById(req.params.meetingId, req.user._id);
  res.status(200).json({ data: { meeting } });
};

const getMeetingByLink = async (req, res) => {
  const meeting = await meetingService.getMeetingByLink(req.params.meetingLink, req.user._id);
  res.status(200).json({ data: { meeting } });
};

const updateMeeting = async (req, res) => {
  const meeting = await meetingService.updateMeeting(
    req.params.meetingId,
    req.user._id,
    req.validatedBody,
    getIo(req),
  );
  res.status(200).json({ data: { meeting } });
};

const cancelMeeting = async (req, res) => {
  const result = await meetingService.cancelMeeting(req.params.meetingId, req.user._id, getIo(req));
  res.status(200).json({ data: result });
};

const requestToJoin = async (req, res) => {
  const result = await meetingService.requestToJoin(req.params.meetingId, req.user._id, getIo(req));
  res.status(201).json({ data: result });
};

const decideJoinRequest = async (req, res) => {
  const result = await meetingService.decideJoinRequest(
    req.params.meetingId,
    req.params.requestId,
    req.user._id,
    req.validatedBody.decision,
    getIo(req),
  );
  res.status(200).json({ data: result });
};

const getMeetingToken = async (req, res) => {
  const result = await meetingService.getMeetingToken(req.params.meetingId, req.user);
  res.status(200).json({ data: result });
};

const muteParticipant = async (req, res) => {
  const result = await meetingService.muteParticipant(
    req.params.meetingId,
    req.user._id,
    req.params.userId,
    req.validatedBody.muted,
  );
  res.status(200).json({ data: result });
};

const removeParticipant = async (req, res) => {
  const result = await meetingService.removeParticipant(
    req.params.meetingId,
    req.user._id,
    req.params.userId,
    getIo(req),
  );
  res.status(200).json({ data: result });
};

const endMeeting = async (req, res) => {
  const result = await meetingService.endMeeting(req.params.meetingId, req.user._id, getIo(req));
  res.status(200).json({ data: result });
};

const extendMeeting = async (req, res) => {
  const result = await meetingService.extendMeeting(
    req.params.meetingId,
    req.user._id,
    req.validatedBody.minutes,
    getIo(req),
  );
  res.status(200).json({ data: result });
};

module.exports = {
  cancelMeeting,
  createMeeting,
  decideJoinRequest,
  endMeeting,
  extendMeeting,
  getMeetingById,
  getMeetingByLink,
  getMeetingToken,
  listMeetings,
  muteParticipant,
  removeParticipant,
  requestToJoin,
  updateMeeting,
};
