const mongoose = require('mongoose');

const { Schema } = mongoose;

const friendshipSchema = new Schema(
  {
    requester: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      validate: {
        validator(value) {
          if (!this.pairLow || !this.pairHigh || !this.requester) return false;
          const pair = [this.pairLow.toString(), this.pairHigh.toString()];
          return (
            this.requester.toString() !== value.toString() &&
            pair.includes(this.requester.toString()) &&
            pair.includes(value.toString())
          );
        },
        message: 'Requester and recipient must be the two users in the friendship pair',
      },
    },
    pairLow: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    pairHigh: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      validate: {
        validator(value) {
          return this.pairLow && value.toString() > this.pairLow.toString();
        },
        message: 'pairLow and pairHigh must be distinct and sorted by ObjectId',
      },
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      required: true,
      default: 'pending',
    },
    rejectionCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    cooldownUntil: {
      type: Date,
      default: null,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, strict: 'throw' },
);

friendshipSchema.index(
  { pairLow: 1, pairHigh: 1 },
  { unique: true, name: 'friendship_pair_unique' },
);
friendshipSchema.index({ recipient: 1, status: 1, createdAt: -1 }, { name: 'friendship_inbox' });
friendshipSchema.index({ requester: 1, status: 1, createdAt: -1 }, { name: 'friendship_outbox' });
friendshipSchema.index({ cooldownUntil: 1 }, { name: 'friendship_cooldown' });

module.exports = mongoose.models.Friendship || mongoose.model('Friendship', friendshipSchema);
