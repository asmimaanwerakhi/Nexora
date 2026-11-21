import { apiClient } from './apiClient.js';

export const getStories = async () => {
  const response = await apiClient.get('/stories');
  return response.data.data.stories;
};

export const getMyStories = async () => {
  const response = await apiClient.get('/stories/mine');
  return response.data.data.stories;
};

export const createStory = async (file, caption) => {
  const formData = new FormData();
  formData.append('file', file);
  if (caption) formData.append('caption', caption);
  const response = await apiClient.post('/stories', formData);
  return response.data.data.story;
};

export const viewStory = async (storyId) => {
  const response = await apiClient.post(`/stories/${storyId}/view`);
  return response.data.data.story;
};

export const deleteStory = async (storyId) => {
  await apiClient.delete(`/stories/${storyId}`);
};
