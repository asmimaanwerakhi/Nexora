const authService = require('../services/authService');
const toPublicUser = require('../services/userDto');
const {
  uploadAvatar: uploadAvatarToStorage,
  uploadCoverPhoto: uploadCoverPhotoToStorage,
} = require('../services/avatarService');
const AppError = require('../utils/AppError');
const Friendship = require('../models/friendship');

const refreshCookieName = () => process.env.REFRESH_COOKIE_NAME || 'refreshToken';
const cookieOptions = () => {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.REFRESH_COOKIE_SAME_SITE || process.env.COOKIE_SAME_SITE || 'lax',
    path: '/api/v1/auth',
  };
  if (process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
  }
  return options;
};

const setRefreshCookie = (res, token) => {
  let maxAge = 7 * 24 * 60 * 60 * 1000;
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  if (Number.isInteger(payload.exp)) {
    maxAge = Math.max(0, payload.exp * 1000 - Date.now());
  }
  res.cookie(refreshCookieName(), token, { ...cookieOptions(), maxAge });
};

const clearRefreshCookie = (res) => res.clearCookie(refreshCookieName(), cookieOptions());

const signup = async (req, res) => {
  const result = await authService.signup(req.validatedBody);
  res.status(201).json({ data: result });
};

const verifyEmail = async (req, res) => {
  const result = await authService.verifyEmail(req.validatedBody);
  res.status(200).json({ data: result });
};

const resendVerification = async (req, res) => {
  const result = await authService.resendVerification(req.validatedBody.email);
  res.status(200).json({
    data: { accepted: true, ...(result.resendAfterSeconds ? result : {}) },
  });
};

const login = async (req, res) => {
  const result = await authService.login(req.validatedBody, req.get('user-agent'));
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    data: { accessToken: result.accessToken, user: result.user },
  });
};

const refresh = async (req, res) => {
  const result = await authService.refresh(req.cookies[refreshCookieName()], req.get('user-agent'));
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    data: { accessToken: result.accessToken, user: result.user },
  });
};

const logout = async (req, res) => {
  await authService.logout(req.cookies[refreshCookieName()]);
  clearRefreshCookie(res);
  res.status(200).json({ data: { loggedOut: true } });
};

const forgotPassword = async (req, res) => {
  await authService.requestPasswordReset(req.validatedBody.email);
  res.status(202).json({
    data: { accepted: true },
    message: 'If an account exists for that email, a reset code has been sent.',
  });
};

const resetPassword = async (req, res) => {
  const result = await authService.resetPassword(req.validatedBody);
  clearRefreshCookie(res);
  res.status(200).json({ data: result });
};

const getProfile = (req, res) => {
  res.status(200).json({ data: { user: toPublicUser(req.user) } });
};

const updateProfile = async (req, res) => {
  const user = await authService.updateProfile(req.user._id, req.validatedBody);
  res.status(200).json({ data: { user } });
};

const updatePreferences = async (req, res) => {
  const user = await authService.updatePreferences(req.user._id, req.validatedBody);
  const io = req.app.get('io');
  if (io) {
    const sockets = await io.in(`user:${req.user._id}`).fetchSockets();
    sockets.forEach((socket) => {
      if (socket.data.user) socket.data.user.privacy = user.privacy;
    });
    if (req.validatedBody.privacy?.showOnlineStatus !== undefined) {
      const friendships = await Friendship.find({
        status: 'accepted',
        $or: [{ requester: req.user._id }, { recipient: req.user._id }],
      }).select('requester recipient');
      const lastSeen =
        user.privacy.lastSeenVisibility === 'nobody' || !user.privacy.showOnlineStatus
          ? null
          : user.isOnline
            ? null
            : user.lastSeen;
      const payload = {
        userId: req.user._id.toString(),
        online: user.privacy.showOnlineStatus && user.isOnline,
        lastSeen,
      };
      for (const friendship of friendships) {
        const friendId =
          friendship.requester.toString() === req.user._id.toString()
            ? friendship.recipient
            : friendship.requester;
        io.to(`user:${friendId}`).emit('presence:update', payload);
      }
    }
  }
  res.status(200).json({ data: { user } });
};

const uploadAvatar = async (req, res) => {
  const user = await uploadAvatarToStorage(req.user._id, req.file);
  res.status(200).json({ data: { user } });
};

const uploadCoverPhoto = async (req, res) => {
  const user = await uploadCoverPhotoToStorage(req.user._id, req.file);
  res.status(200).json({ data: { user } });
};

const ensureRefreshCookie = (req, _res, next) => {
  if (!req.cookies[refreshCookieName()]) {
    next(
      new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your session has expired. Please sign in again'),
    );
    return;
  }
  next();
};

module.exports = {
  ensureRefreshCookie,
  forgotPassword,
  getProfile,
  login,
  logout,
  refresh,
  resendVerification,
  resetPassword,
  signup,
  updateProfile,
  updatePreferences,
  uploadAvatar,
  uploadCoverPhoto,
  verifyEmail,
};
