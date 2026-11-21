const mongoose = require('mongoose');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    username: {
      type: String,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 20,
      match: /^[a-z0-9_]{3,20}$/,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 32,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    avatar: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: null,
    },
    avatarPublicId: {
      type: String,
      trim: true,
      maxlength: 512,
      default: null,
      select: false,
    },
    coverPhoto: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: null,
    },
    coverPhotoPublicId: {
      type: String,
      trim: true,
      maxlength: 512,
      default: null,
      select: false,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 160,
      default: '',
    },
    about: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    authVersion: {
      type: Number,
      min: 0,
      default: 0,
      select: false,
    },
    pushTokens: {
      type: [{ type: String, trim: true, maxlength: 4096 }],
      default: [],
      select: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['everyone', 'friends'],
        default: 'everyone',
      },
      lastSeenVisibility: {
        type: String,
        enum: ['everyone', 'friends', 'nobody'],
        default: 'everyone',
      },
      readReceipts: {
        type: Boolean,
        default: true,
      },
      showOnlineStatus: {
        type: Boolean,
        default: true,
      },
      allowFriendRequests: {
        type: Boolean,
        default: true,
      },
      callPermission: {
        type: String,
        enum: ['everyone', 'friends', 'nobody'],
        default: 'friends',
      },
    },
    settings: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'system'],
        default: 'system',
      },
      notificationsEnabled: {
        type: Boolean,
        default: true,
      },
      aiFeaturesEnabled: {
        type: Boolean,
        default: false,
      },
      timezone: {
        type: String,
        trim: true,
        maxlength: 64,
        default: 'UTC',
      },
      language: {
        type: String,
        trim: true,
        maxlength: 16,
        default: 'en',
      },
    },
  },
  {
    timestamps: true,
    strict: 'throw',
    optimisticConcurrency: true,
  },
);

userSchema.pre('validate', function moveLegacyBioToAbout() {
  if (this.bio?.length > 160 && !this.about) {
    this.about = this.bio;
    this.bio = '';
  }
});

userSchema.index({ email: 1 }, { unique: true, name: 'email_unique' });
userSchema.index(
  { phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: 'string' } },
    name: 'phone_unique_when_present',
  },
);
userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: { username: { $type: 'string' } },
    name: 'username_unique_when_present',
  },
);
userSchema.index({ name: 'text' }, { name: 'name_text_search' });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
