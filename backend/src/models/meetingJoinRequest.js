const mongoose = require('mongoose');

const { Schema } = mongoose;

const meetingJoinRequestSchema = new Schema(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: 'Meeting',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled'],
      required: true,
      default: 'pending',
    },
    rejectionCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, strict: 'throw' },
);

meetingJoinRequestSchema.index(
  { meetingId: 1, userId: 1 },
  { unique: true, name: 'meeting_join_request_pair_unique' },
);
meetingJoinRequestSchema.index(
  { meetingId: 1, status: 1, requestedAt: 1 },
  { name: 'meeting_join_requests_by_status' },
);
meetingJoinRequestSchema.index(
  { userId: 1, status: 1, updatedAt: -1 },
  { name: 'meeting_join_requests_by_user' },
);

module.exports =
  mongoose.models.MeetingJoinRequest ||
  mongoose.model('MeetingJoinRequest', meetingJoinRequestSchema);
