const rateLimit = require('express-rate-limit');

const createLimiter = (limit, windowMs) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler(_req, res) {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      });
    },
  });

module.exports = {
  forgotPasswordLimiter: createLimiter(5, 15 * 60 * 1000),
  loginLimiter: createLimiter(10, 15 * 60 * 1000),
  otpLimiter: createLimiter(10, 15 * 60 * 1000),
  resendOtpLimiter: createLimiter(5, 15 * 60 * 1000),
  signupLimiter: createLimiter(5, 60 * 60 * 1000),
};
