const { z } = require('zod');

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const password = z.string().min(8).max(128);
const otpCode = z.string().regex(/^\d{6}$/, 'Code must contain exactly 6 digits');
const username = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z.string().regex(/^[a-z0-9_]{3,20}$/, 'Username must be 3-20 letters, numbers, or underscores'),
  );

const signupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email,
    phone: z.string().trim().min(7).max(32).optional(),
    password,
  })
  .strict();

const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
  })
  .strict();

const emailSchema = z.object({ email }).strict();
const verifyOtpSchema = z.object({ email, code: otpCode }).strict();

const resetPasswordSchema = z
  .object({
    email,
    code: otpCode,
    password,
  })
  .strict();

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    username: username.optional(),
    bio: z.string().trim().max(160).optional(),
    about: z.string().trim().max(2000).optional(),
    phone: z.string().trim().min(7).max(32).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one profile field to update',
  });
const preferencesSchema = z
  .object({
    privacy: z
      .object({
        profileVisibility: z.enum(['everyone', 'friends']).optional(),
        lastSeenVisibility: z.enum(['everyone', 'friends', 'nobody']).optional(),
        readReceipts: z.boolean().optional(),
        showOnlineStatus: z.boolean().optional(),
        allowFriendRequests: z.boolean().optional(),
        callPermission: z.enum(['everyone', 'friends', 'nobody']).optional(),
      })
      .strict()
      .optional(),
    settings: z
      .object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        notificationsEnabled: z.boolean().optional(),
        timezone: z.string().trim().min(1).max(64).optional(),
        language: z.string().trim().min(2).max(16).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.privacy && Object.keys(value.privacy).length > 0) ||
      (value.settings && Object.keys(value.settings).length > 0),
    'Provide at least one preference to update',
  );

module.exports = {
  emailSchema,
  loginSchema,
  preferencesSchema,
  profileSchema,
  resetPasswordSchema,
  signupSchema,
  verifyOtpSchema,
};
