const storyService = require('../services/storyService');
const AppError = require('../utils/AppError');

const createStory = async (req, res) => {
  if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Choose an image or video');
  if (!['image/', 'video/'].some((prefix) => req.file.mimetype.startsWith(prefix))) {
    throw new AppError(400, 'INVALID_STORY_MEDIA', 'Stories require an image or video');
  }
  const story = await storyService.createStory(
    req.user._id,
    req.file,
    req.validatedBody.caption || '',
  );
  res.status(201).json({ data: { story } });
};

const getFeed = async (req, res) => {
  const stories = await storyService.getStoryFeed(req.user._id);
  res.status(200).json({ data: { stories } });
};

const getMine = async (req, res) => {
  const stories = await storyService.listMyStories(req.user._id);
  res.status(200).json({ data: { stories } });
};

const viewStory = async (req, res) => {
  const story = await storyService.viewStory(req.user._id, req.params.storyId);
  res.status(200).json({ data: { story } });
};

const deleteStory = async (req, res) => {
  await storyService.deleteStory(req.user._id, req.params.storyId);
  res.status(200).json({ data: { deleted: true } });
};

module.exports = { createStory, deleteStory, getFeed, getMine, viewStory };
