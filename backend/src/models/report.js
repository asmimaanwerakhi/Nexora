const mongoose = require('mongoose');

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reportedUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    reason: {
      type: String,
      enum: ['spam', 'harassment', 'impersonation', 'inappropriate_content', 'other'],
      required: true,
    },
    details: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved', 'dismissed'],
      default: 'open',
      required: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, strict: 'throw' },
);

reportSchema.index({ status: 1, createdAt: 1 }, { name: 'reports_by_status' });
reportSchema.index({ reporter: 1, createdAt: -1 }, { name: 'reports_by_reporter_recent' });
reportSchema.index({ reportedUser: 1, createdAt: -1 }, { name: 'reports_by_reported_user' });

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);
