const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const Otp = require('../models/otp');
const AppError = require('../utils/AppError');
const { sendOtpEmail } = require('./emailService');

const OTP_LIFETIME_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const INVALID_CODE = () =>
  new AppError(400, 'INVALID_OR_EXPIRED_CODE', 'The code is invalid, expired, or locked');

const issueOtp = async (user, purpose) => {
  const now = new Date();
  const existing = await Otp.findOne({ userId: user._id, purpose });

  if (existing && now.getTime() - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
    const retryAfterSeconds = Math.ceil(
      (RESEND_COOLDOWN_MS - (now.getTime() - existing.updatedAt.getTime())) / 1000,
    );
    throw new AppError(429, 'OTP_RESEND_COOLDOWN', `Try again in ${retryAfterSeconds} seconds`);
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const codeHash = await bcrypt.hash(code, 10);
  const otp = await Otp.findOneAndUpdate(
    { userId: user._id, purpose },
    {
      $set: {
        codeHash,
        attempts: 0,
        expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS),
        consumedAt: null,
      },
      $setOnInsert: { userId: user._id, purpose },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  try {
    await sendOtpEmail({ email: user.email, code, purpose });
  } catch (error) {
    await Otp.deleteOne({ _id: otp._id, codeHash });
    throw error;
  }

  return { resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
};

const consumeOtp = async (userId, purpose, code) => {
  const now = new Date();
  const otp = await Otp.findOne({ userId, purpose }).select('+codeHash');

  if (!otp || otp.consumedAt || otp.expiresAt <= now || otp.attempts >= 3) {
    throw INVALID_CODE();
  }

  const matches = await bcrypt.compare(code, otp.codeHash);
  if (!matches) {
    await Otp.updateOne(
      { _id: otp._id, consumedAt: null, attempts: { $lt: 3 } },
      { $inc: { attempts: 1 } },
    );
    throw INVALID_CODE();
  }

  const consumed = await Otp.updateOne(
    {
      _id: otp._id,
      consumedAt: null,
      attempts: { $lt: 3 },
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
  );

  if (consumed.modifiedCount !== 1) {
    throw INVALID_CODE();
  }
};

module.exports = { consumeOtp, issueOtp };
