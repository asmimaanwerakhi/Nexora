const bcrypt = require('bcryptjs');
const RefreshSession = require('../models/refreshSession');
const User = require('../models/user');
const AppError = require('../utils/AppError');
const { consumeOtp, issueOtp } = require('./otpService');
const { issueTokenPair, revokeRefreshToken, rotateRefreshToken } = require('./tokenService');
const toPublicUser = require('./userDto');

const duplicateEmailError = () =>
  new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists');

const preserveLegacyBio = (user) => {
  if (user.bio?.length > 160 && !user.about) {
    user.about = user.bio;
    user.bio = '';
  }
};

const hashPassword = (password) => {
  const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
  if (!Number.isInteger(rounds) || rounds < 10 || rounds > 14) {
    throw new AppError(
      500,
      'AUTH_CONFIGURATION_ERROR',
      'BCRYPT_SALT_ROUNDS must be between 10 and 14',
    );
  }
  return bcrypt.hash(password, rounds);
};

const signup = async ({ name, email, phone, password }) => {
  if (await User.exists({ email })) {
    throw duplicateEmailError();
  }

  const passwordHash = await hashPassword(password);
  let user;

  try {
    user = await User.create({ name, email, phone, passwordHash });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
      throw duplicateEmailError();
    }
    if (error.code === 11000 && error.keyPattern && error.keyPattern.phone) {
      throw new AppError(409, 'PHONE_ALREADY_REGISTERED', 'This phone number is already in use');
    }
    throw error;
  }

  await issueOtp(user, 'email_verification');
  return { email: user.email, userId: user._id.toString() };
};

const verifyEmail = async ({ email, code }) => {
  const user = await User.findOne({ email });
  if (!user || user.isVerified) {
    throw new AppError(400, 'INVALID_OR_EXPIRED_CODE', 'The code is invalid, expired, or locked');
  }

  await consumeOtp(user._id, 'email_verification', code);
  user.isVerified = true;
  await user.save();
  return { verified: true };
};

const resendVerification = async (email) => {
  const user = await User.findOne({ email });
  if (!user || user.isVerified) {
    return { accepted: true };
  }
  try {
    return await issueOtp(user, 'email_verification');
  } catch (error) {
    if (error.code === 'OTP_RESEND_COOLDOWN') {
      return { accepted: true };
    }
    throw error;
  }
};

const login = async ({ email, password }, userAgent) => {
  const user = await User.findOne({ email }).select('+passwordHash +authVersion');
  const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (!user.isVerified) {
    throw new AppError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in');
  }

  const tokens = await issueTokenPair(user, userAgent);
  return { ...tokens, user: toPublicUser(user) };
};

const refresh = async (token, userAgent) => {
  const result = await rotateRefreshToken(token, userAgent);
  return {
    ...result,
    user: toPublicUser(result.user),
  };
};

const logout = async (token) => {
  await revokeRefreshToken(token);
};

const requestPasswordReset = async (email) => {
  const user = await User.findOne({ email });
  if (user && user.isVerified) {
    try {
      await issueOtp(user, 'password_reset');
    } catch (error) {
      if (error.code !== 'OTP_RESEND_COOLDOWN') {
        throw error;
      }
    }
  }
  return { accepted: true };
};

const resetPassword = async ({ email, code, password }) => {
  const user = await User.findOne({ email }).select('+authVersion');
  if (!user || !user.isVerified) {
    throw new AppError(400, 'INVALID_OR_EXPIRED_CODE', 'The code is invalid, expired, or locked');
  }

  await consumeOtp(user._id, 'password_reset', code);
  user.passwordHash = await hashPassword(password);
  user.authVersion += 1;
  await user.save();
  await RefreshSession.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return { reset: true };
};

const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  return toPublicUser(user);
};

const updateProfile = async (userId, updates) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }

  preserveLegacyBio(user);
  Object.assign(user, updates);
  try {
    await user.save();
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.username) {
      throw new AppError(409, 'USERNAME_ALREADY_TAKEN', 'This username is already in use');
    }
    if (error.code === 11000 && error.keyPattern && error.keyPattern.phone) {
      throw new AppError(409, 'PHONE_ALREADY_REGISTERED', 'This phone number is already in use');
    }
    throw error;
  }
  return toPublicUser(user);
};

const updatePreferences = async (userId, updates) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  if (updates.privacy) Object.assign(user.privacy, updates.privacy);
  if (updates.settings) Object.assign(user.settings, updates.settings);
  await user.save();
  return toPublicUser(user);
};

const setAvatar = async (userId, avatar, avatarPublicId) => {
  const user = await User.findById(userId).select('+avatarPublicId');
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  const previousPublicId = user.avatarPublicId;
  user.avatar = avatar;
  user.avatarPublicId = avatarPublicId;
  await user.save();
  return { user: toPublicUser(user), previousPublicId };
};

const setCoverPhoto = async (userId, coverPhoto, coverPhotoPublicId) => {
  const user = await User.findById(userId).select('+coverPhotoPublicId');
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  const previousPublicId = user.coverPhotoPublicId;
  user.coverPhoto = coverPhoto;
  user.coverPhotoPublicId = coverPhotoPublicId;
  await user.save();
  return { user: toPublicUser(user), previousPublicId };
};

const updatePushToken = async (userId, token) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $addToSet: { pushTokens: token } },
    { new: true, runValidators: true },
  );
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
};

const removePushToken = async (userId, token) => {
  await User.updateOne({ _id: userId }, { $pull: { pushTokens: token } });
};

module.exports = {
  getProfile,
  login,
  logout,
  refresh,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  removePushToken,
  setAvatar,
  setCoverPhoto,
  signup,
  updatePushToken,
  updateProfile,
  updatePreferences,
  verifyEmail,
};
