const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const RefreshSession = require('../models/refreshSession');
const AppError = require('../utils/AppError');
const User = require('../models/user');

const TOKEN_ISSUER = 'Nexora-api';
const TOKEN_AUDIENCE = 'Nexora-client';
const INVALID_REFRESH = () =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your session has expired. Please sign in again.');

const getSecret = (key) => {
  const secret = process.env[key];
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new AppError(
      500,
      'AUTH_CONFIGURATION_ERROR',
      `${key} must contain at least 32 characters`,
    );
  }
  return secret;
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const signAccessToken = (user) =>
  jwt.sign({ type: 'access', ver: user.authVersion || 0 }, getSecret('JWT_ACCESS_SECRET'), {
    subject: user._id.toString(),
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });

const verifyAccessToken = (token) => {
  const secret = getSecret('JWT_ACCESS_SECRET');
  let claims;

  try {
    claims = jwt.verify(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
  } catch {
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Authentication is required');
  }

  if (
    typeof claims === 'string' ||
    claims.type !== 'access' ||
    typeof claims.sub !== 'string' ||
    !mongoose.isValidObjectId(claims.sub) ||
    !Number.isInteger(claims.ver) ||
    !Number.isInteger(claims.exp)
  ) {
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Authentication is required');
  }

  return claims;
};

const authenticateAccessToken = async (token) => {
  const claims = verifyAccessToken(token);
  const user = await User.findById(claims.sub).select('+authVersion');

  if (!user || !user.isVerified || user.authVersion !== claims.ver) {
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Authentication is required');
  }

  return { claims, user };
};

const createRefreshSession = async (userId, familyId, userAgent) => {
  const sessionId = new mongoose.Types.ObjectId();
  const refreshToken = jwt.sign(
    { type: 'refresh', sid: sessionId.toString(), familyId },
    getSecret('JWT_REFRESH_SECRET'),
    {
      subject: userId.toString(),
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    },
  );
  const claims = jwt.decode(refreshToken);

  if (!claims || typeof claims === 'string' || typeof claims.exp !== 'number') {
    throw new AppError(500, 'TOKEN_CREATION_FAILED', 'Could not create a session');
  }

  await RefreshSession.create({
    _id: sessionId,
    userId,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(claims.exp * 1000),
    userAgent: (userAgent || '').slice(0, 512),
  });

  return { refreshToken, sessionId };
};

const verifyRefreshToken = (token) => {
  const secret = getSecret('JWT_REFRESH_SECRET');
  let claims;

  try {
    claims = jwt.verify(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });
  } catch {
    throw INVALID_REFRESH();
  }

  if (
    typeof claims === 'string' ||
    claims.type !== 'refresh' ||
    typeof claims.sub !== 'string' ||
    !mongoose.isValidObjectId(claims.sub) ||
    typeof claims.sid !== 'string' ||
    !mongoose.isValidObjectId(claims.sid) ||
    typeof claims.familyId !== 'string'
  ) {
    throw INVALID_REFRESH();
  }

  return claims;
};

const issueTokenPair = async (user, userAgent = '') => {
  const familyId = crypto.randomUUID();
  const { refreshToken } = await createRefreshSession(user._id, familyId, userAgent);
  return {
    accessToken: signAccessToken(user),
    refreshToken,
  };
};

const rotateRefreshToken = async (token, userAgent = '') => {
  const claims = verifyRefreshToken(token);
  const session = await RefreshSession.findById(claims.sid).select('+tokenHash +familyId');
  const tokenHash = hashToken(token);

  if (!session || session.userId.toString() !== claims.sub) {
    throw INVALID_REFRESH();
  }

  const expectedHash = Buffer.from(session.tokenHash, 'hex');
  const providedHash = Buffer.from(tokenHash, 'hex');
  if (
    expectedHash.length !== providedHash.length ||
    !crypto.timingSafeEqual(expectedHash, providedHash)
  ) {
    throw INVALID_REFRESH();
  }

  const now = new Date();
  if (session.revokedAt) {
    await RefreshSession.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw INVALID_REFRESH();
  }
  if (session.expiresAt <= now) {
    throw INVALID_REFRESH();
  }

  const user = await User.findById(session.userId).select('+authVersion');
  if (!user || !user.isVerified) {
    throw INVALID_REFRESH();
  }

  const next = await createRefreshSession(user._id, session.familyId, userAgent);
  const rotation = await RefreshSession.updateOne(
    { _id: session._id, revokedAt: null, tokenHash },
    { $set: { revokedAt: now, replacedBySessionId: next.sessionId } },
  );

  if (rotation.modifiedCount !== 1) {
    await RefreshSession.deleteOne({ _id: next.sessionId });
    await RefreshSession.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw INVALID_REFRESH();
  }

  return {
    accessToken: signAccessToken(user),
    refreshToken: next.refreshToken,
    user,
  };
};

const revokeRefreshToken = async (token) => {
  if (!token) {
    return;
  }

  await RefreshSession.updateOne(
    { tokenHash: hashToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
};

module.exports = {
  hashToken,
  authenticateAccessToken,
  issueTokenPair,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  verifyAccessToken,
};
