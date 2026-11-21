const mongoose = require('mongoose');
const Block = require('../models/block');
const Friendship = require('../models/friendship');
const Story = require('../models/story');
const AppError = require('../utils/AppError');
const { deleteMessageMedia, uploadMessageMedia } = require('./messageMediaService');

const STORY_DURATION_MS = 24 * 60 * 60 * 1000;

const createStory = async (userId, file, caption = '') => {
  if (!file || (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/'))) {
    throw new AppError(400, 'INVALID_STORY_MEDIA', 'Stories require an image or video');
  }
  const media = await uploadMessageMedia(file);
  try {
    const story = await Story.create({
      userId,
      mediaUrl: media.url,
      mediaPublicId: media.publicId,
      mediaType: file.mimetype.startsWith('image/') ? 'image' : 'video',
      caption,
      expiresAt: new Date(Date.now() + STORY_DURATION_MS),
    });
    await story.populate('userId', 'name username avatar');
    return story;
  } catch (error) {
    try {
      await deleteMessageMedia(media);
    } catch (cleanupError) {
      console.error('Could not clean up an unreferenced story upload', cleanupError);
    }
    throw error;
  }
};

const getStoryFeed = async (userId) => {
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userId }, { recipient: userId }],
  }).select('requester recipient');
  const friendIds = friendships.map((friendship) =>
    friendship.requester.toString() === userId.toString()
      ? friendship.recipient
      : friendship.requester,
  );
  const blocks = await Block.find({
    $or: [
      { blocker: userId, blocked: { $in: friendIds } },
      { blocked: userId, blocker: { $in: friendIds } },
    ],
  }).select('blocker blocked');
  const blockedIds = new Set(
    blocks.map((block) =>
      block.blocker.toString() === userId.toString()
        ? block.blocked.toString()
        : block.blocker.toString(),
    ),
  );
  const visibleUserIds = friendIds.filter((id) => !blockedIds.has(id.toString()));
  visibleUserIds.push(userId);
  const stories = await Story.find({
    userId: { $in: visibleUserIds },
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: 1 })
    .populate('userId', 'name username avatar')
    .lean();
  return stories.map((story) => ({
    ...story,
    id: story._id.toString(),
    author: {
      id: story.userId._id.toString(),
      name: story.userId.name,
      username: story.userId.username || null,
      avatar: story.userId.avatar,
    },
    viewedByMe:
      story.userId._id.toString() === userId.toString() ||
      story.viewers.some((viewer) => viewer.userId.toString() === userId.toString()),
    viewerCount: story.viewers.length,
  }));
};

const viewStory = async (userId, storyId) => {
  if (!mongoose.isValidObjectId(storyId)) {
    throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found');
  }
  const story = await Story.findOne({ _id: storyId, expiresAt: { $gt: new Date() } });
  if (!story) throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found');
  if (story.userId.toString() !== userId.toString()) {
    const [friendship, block] = await Promise.all([
      Friendship.exists({
        status: 'accepted',
        $or: [
          { requester: userId, recipient: story.userId },
          { requester: story.userId, recipient: userId },
        ],
      }),
      Block.exists({
        $or: [
          { blocker: userId, blocked: story.userId },
          { blocker: story.userId, blocked: userId },
        ],
      }),
    ]);
    if (!friendship || block) throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found');
    await Story.updateOne(
      { _id: story._id, 'viewers.userId': { $ne: userId } },
      { $push: { viewers: { userId, viewedAt: new Date() } } },
    );
  }
  return Story.findById(story._id).populate('userId', 'name username avatar');
};

const deleteStory = async (userId, storyId) => {
  if (!mongoose.isValidObjectId(storyId)) {
    throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found');
  }
  const story = await Story.findOne({ _id: storyId, userId }).select('+mediaPublicId');
  if (!story) throw new AppError(404, 'STORY_NOT_FOUND', 'Story not found');
  if (story.mediaPublicId) {
    await deleteMessageMedia({
      publicId: story.mediaPublicId,
      resourceType: story.mediaType === 'video' ? 'video' : 'image',
    });
  }
  await story.deleteOne();
};

const listMyStories = async (userId) => {
  const stories = await Story.find({ userId, expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .lean();
  return stories.map((story) => ({
    ...story,
    id: story._id.toString(),
    viewerCount: story.viewers.length,
  }));
};

module.exports = { createStory, deleteStory, getStoryFeed, listMyStories, viewStory };
