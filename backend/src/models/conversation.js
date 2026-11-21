const mongoose = require('mongoose');

const { Schema } = mongoose;

const participantSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    lastReadAt: {
      type: Date,
      default: null,
    },
    unreadCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    notificationsMuted: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const lastMessageSchema = new Schema(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    preview: {
      type: String,
      maxlength: 200,
      default: '',
    },
    type: {
      type: String,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['direct', 'group'],
      required: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
      validate: {
        validator(participants) {
          if (participants.length < 1 || (this.type === 'direct' && participants.length !== 2)) {
            return false;
          }
          const ids = participants.map(({ userId }) => userId.toString());
          return new Set(ids).size === ids.length;
        },
        message:
          'A direct conversation requires two unique participants; groups require at least one',
      },
    },
    directKey: {
      type: String,
      trim: true,
      select: false,
      required() {
        return this.type === 'direct';
      },
      validate: {
        validator(value) {
          if (this.type !== 'direct') return true;
          const match = /^([a-f\d]{24}):([a-f\d]{24})$/i.exec(value || '');
          return Boolean(match && match[1].toLowerCase() < match[2].toLowerCase());
        },
        message: 'Direct conversations require a key made from sorted participant IDs',
      },
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
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
    permissions: {
      adminsOnlyMessages: { type: Boolean, default: false },
      adminsOnlyAddMembers: { type: Boolean, default: false },
      adminsOnlyEditInfo: { type: Boolean, default: true },
    },
    lastMessage: {
      type: lastMessageSchema,
      default: () => ({}),
    },
    pinnedMessages: {
      type: [
        {
          messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
          pinnedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          pinnedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true, strict: 'throw' },
);

conversationSchema.index(
  { directKey: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'direct' },
    name: 'direct_conversation_unique',
  },
);
conversationSchema.index(
  { 'participants.userId': 1, updatedAt: -1 },
  { name: 'participant_conversations_recent' },
);

module.exports = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
