const express = require('express');
const {
  forgotPasswordLimiter,
  loginLimiter,
  otpLimiter,
  resendOtpLimiter,
  signupLimiter,
} = require('../middlewares/authRateLimit');
const validate = require('../middlewares/validate');
const authController = require('../controllers/authController');
const {
  emailSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  verifyOtpSchema,
} = require('../validators/authSchemas');

const router = express.Router();

router.post('/signup', signupLimiter, validate(signupSchema), authController.signup);
router.post('/verify-otp', otpLimiter, validate(verifyOtpSchema), authController.verifyEmail);
router.post(
  '/resend-otp',
  resendOtpLimiter,
  validate(emailSchema),
  authController.resendVerification,
);
router.post('/login', loginLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authController.ensureRefreshCookie, authController.refresh);
router.post('/logout', authController.logout);
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate(emailSchema),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  otpLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword,
);

module.exports = router;
