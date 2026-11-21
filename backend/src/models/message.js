const mongoose = require('mongoose');

const { Schema } = mongoose;

const mediaSchema = new Schema(
  {
    url: { type: String, trim: true, maxlength: 2048, required: true },
    publicId: { type: String, trim: true, maxlength: 512, default: null },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], default: 'raw' },
    mimeType: { type: String, trim: true, maxlength: 128, default: null },
    originalName: { type: String, trim: true, maxlength: 255, default: null },
    sizeBytes: { type: Number, min: 0, default: null },
    durationSeconds: { type: Number, min: 0, default: null },
    width: { type: Number, min: 0, default: null },
    height: { type: Number, min: 0, default: null },
  },
  { _id: false },
);

const receiptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
  },
  { _id: false },
);

const reactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, trim: true, maxlength: 32, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      required() {
        return this.type !== 'system';
      },
    },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'file', 'voice', 'system', 'poll'],
      required: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 10000,
      default: '',
      validate: {
        validator(value) {
          return (
            this.deletedForAll || !['text', 'system'].includes(this.type) || value.trim().length > 0
          );
        },
        message: 'Text and system messages require text content',
      },
    },
    media: {
      type: mediaSchema,
      default: null,
      required() {
        return ['image', 'video', 'file', 'voice'].includes(this.type);
      },
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    clientMessageId: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'seen'],
      default: 'sent',
    },
    receipts: {
      type: [receiptSchema],
      default: [],
    },
    deletedFor: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    deletedForAll: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    reactions: {
      type: [reactionSchema],
      default: [],
      validate: {
        validator(reactions) {
          const userIds = reactions.map(({ userId }) => userId.toString());
          return new Set(userIds).size === userIds.length;
        },
        message: 'Each user may have only one reaction per message',
      },
    },
    forwardedFrom: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    starredBy: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  { timestamps: true, strict: 'throw' },
);

messageSchema.index(
  { conversationId: 1, createdAt: -1, _id: -1 },
  { name: 'conversation_messages_cursor' },
);
messageSchema.index({ text: 'text' }, { name: 'message_text_search' });
messageSchema.index(
  { conversationId: 1, sender: 1, clientMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientMessageId: { $type: 'string' } },
    name: 'sender_client_message_unique',
  },
);

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
