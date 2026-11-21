const mongoose = require('mongoose');

const { Schema } = mongoose;

const storyViewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    viewedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const storySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    mediaUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2048,
    },
    mediaPublicId: {
      type: String,
      trim: true,
      maxlength: 512,
      default: null,
      select: false,
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      required: true,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    viewers: {
      type: [storyViewSchema],
      default: [],
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true, strict: 'throw' },
);

storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'story_expiry_ttl' });
storySchema.index({ userId: 1, createdAt: -1 }, { name: 'stories_by_user_recent' });

module.exports = mongoose.models.Story || mongoose.model('Story', storySchema);
