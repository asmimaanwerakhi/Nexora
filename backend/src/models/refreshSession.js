const mongoose = require('mongoose');

const { Schema } = mongoose;

const refreshSessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    familyId: {
      type: String,
      required: true,
      trim: true,
      select: false,
    },
    tokenHash: {
      type: String,
      required: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedBySessionId: {
      type: Schema.Types.ObjectId,
      ref: 'RefreshSession',
      default: null,
      select: false,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
      default: '',
    },
  },
  { timestamps: true, strict: 'throw' },
);

refreshSessionSchema.index({ tokenHash: 1 }, { unique: true, name: 'refresh_token_hash_unique' });
refreshSessionSchema.index({ userId: 1, createdAt: -1 }, { name: 'refresh_sessions_by_user' });
refreshSessionSchema.index({ familyId: 1 }, { name: 'refresh_sessions_by_family' });
refreshSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'refresh_session_expiry_ttl' },
);

module.exports =
  mongoose.models.RefreshSession || mongoose.model('RefreshSession', refreshSessionSchema);
