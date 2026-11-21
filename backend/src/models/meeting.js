const mongoose = require('mongoose');
const { nanoid } = require('nanoid');

const { Schema } = mongoose;

const meetingSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000,
      default: '',
    },
    hostId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 1440,
    },
    timezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: 'UTC',
    },
    accessType: {
      type: String,
      enum: ['restricted', 'link'],
      required: true,
      default: 'restricted',
    },
    allowLinkRequests: {
      type: Boolean,
      default: false,
    },
    allowEarlyJoin: {
      type: Boolean,
      default: true,
    },
    earlyJoinMinutes: {
      type: Number,
      min: 0,
      max: 1440,
      default: 10,
    },
    invitedUsers: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      validate: {
        validator(userIds) {
          const ids = userIds.map((userId) => userId.toString());
          return new Set(ids).size === ids.length;
        },
        message: 'Invited users must be unique',
      },
    },
    removedUsers: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    meetingLink: {
      type: String,
      required: true,
      default: () => nanoid(10),
      trim: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'ended', 'cancelled'],
      default: 'scheduled',
      required: true,
    },
  },
  { timestamps: true, strict: 'throw' },
);

meetingSchema.index({ meetingLink: 1 }, { unique: true, name: 'meeting_link_unique' });
meetingSchema.index({ hostId: 1, startTime: -1 }, { name: 'meetings_by_host_start' });
meetingSchema.index({ invitedUsers: 1, startTime: -1 }, { name: 'meetings_by_invitee_start' });

module.exports = mongoose.models.Meeting || mongoose.model('Meeting', meetingSchema);
