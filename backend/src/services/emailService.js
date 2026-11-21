const nodemailer = require('nodemailer');
const AppError = require('../utils/AppError');

const createTransport = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  const port = Number(SMTP_PORT);

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !Number.isInteger(port) || port <= 0) {
    throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
};

const sendOtpEmail = async ({ email, code, purpose }) => {
  const subjects = {
    email_verification: 'Verify your Nexora email',
    password_reset: 'Reset your Nexora password',
  };
  const subject = subjects[purpose];

  if (!subject) {
    throw new AppError(400, 'INVALID_OTP_PURPOSE', 'Unsupported verification code purpose');
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await createTransport().sendMail({
    from,
    to: email,
    subject,
    text: `Your Nexora verification code is ${code}. It expires in 5 minutes.`,
    html: `<p>Your Nexora verification code is <strong>${code}</strong>.</p><p>It expires in 5 minutes. If you did not request this, you can ignore this email.</p>`,
  });
};

module.exports = { sendOtpEmail };
