const mongoose = require('mongoose');

const { Schema } = mongoose;

const callSchema = new Schema(
  {
    caller: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      validate: {
        validator(value) {
          return this.caller && !value.equals(this.caller);
        },
        message: 'A user cannot call themselves',
      },
    },
    type: {
      type: String,
      enum: ['voice', 'video'],
      required: true,
    },
    status: {
      type: String,
      enum: ['ringing', 'answered', 'rejected', 'missed', 'ended'],
      default: 'ringing',
      required: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    durationSeconds: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { timestamps: true, strict: 'throw' },
);

callSchema.index({ caller: 1, createdAt: -1 }, { name: 'calls_by_caller_recent' });
callSchema.index({ receiver: 1, createdAt: -1 }, { name: 'calls_by_receiver_recent' });

module.exports = mongoose.models.Call || mongoose.model('Call', callSchema);
