import { apiClient } from './apiClient.js';

export const getMeetings = async () => {
  const response = await apiClient.get('/meetings');
  return response.data.data.meetings;
};

export const createMeeting = async (values) => {
  const response = await apiClient.post('/meetings', values);
  return response.data.data.meeting;
};

export const getMeeting = async (meetingId) => {
  const response = await apiClient.get(`/meetings/${meetingId}`);
  return response.data.data.meeting;
};

export const getMeetingByLink = async (meetingLink) => {
  const response = await apiClient.get(`/meetings/link/${encodeURIComponent(meetingLink)}`);
  return response.data.data.meeting;
};

export const updateMeeting = async (meetingId, values) => {
  const response = await apiClient.patch(`/meetings/${meetingId}`, values);
  return response.data.data.meeting;
};

export const cancelMeeting = async (meetingId) => {
  const response = await apiClient.delete(`/meetings/${meetingId}`);
  return response.data.data;
};

export const requestMeetingAccess = async (meetingId) => {
  const response = await apiClient.post(`/meetings/${meetingId}/request`, {});
  return response.data.data;
};

export const decideMeetingJoinRequest = async (meetingId, requestId, decision) => {
  const response = await apiClient.post(`/meetings/${meetingId}/requests/${requestId}/decision`, {
    decision,
  });
  return response.data.data;
};

export const getMeetingToken = async (meetingId) => {
  const response = await apiClient.post(`/meetings/${meetingId}/token`);
  return response.data.data;
};

export const muteMeetingParticipant = async (meetingId, userId, muted) => {
  const response = await apiClient.patch(`/meetings/${meetingId}/participants/${userId}/mute`, {
    muted,
  });
  return response.data.data;
};

export const removeMeetingParticipant = async (meetingId, userId) => {
  const response = await apiClient.delete(`/meetings/${meetingId}/participants/${userId}`);
  return response.data.data;
};

export const endMeeting = async (meetingId) => {
  const response = await apiClient.post(`/meetings/${meetingId}/end`);
  return response.data.data;
};

export const extendMeeting = async (meetingId, minutes) => {
  const response = await apiClient.post(`/meetings/${meetingId}/extend`, { minutes });
  return response.data.data;
};
