const mongoose = require('mongoose');

const { Schema } = mongoose;

const otpSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    purpose: {
      type: String,
      enum: ['email_verification', 'phone_verification', 'password_reset'],
      required: true,
    },
    codeHash: {
      type: String,
      required: true,
      select: false,
    },
    attempts: {
      type: Number,
      min: 0,
      max: 3,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true, strict: 'throw' },
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'otp_expiry_ttl' });
otpSchema.index({ userId: 1, purpose: 1 }, { unique: true, name: 'otp_user_purpose_unique' });

module.exports = mongoose.models.Otp || mongoose.model('Otp', otpSchema);
