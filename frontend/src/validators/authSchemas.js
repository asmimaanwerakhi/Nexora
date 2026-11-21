import { z } from 'zod';

const email = z
  .email('Enter a valid email address')
  .max(254)
  .transform((value) => value.trim().toLowerCase());
const password = z.string().min(8, 'Use at least 8 characters').max(128);
const otpCode = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name').max(80),
    email,
    password,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const emailSchema = z.object({ email });

export const otpVerificationSchema = z.object({
  email,
  code: otpCode,
});

export const resetPasswordSchema = z
  .object({
    email,
    code: otpCode,
    password,
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  username: z.union([
    z
      .string()
      .trim()
      .transform((value) => value.replace(/^@/, '').toLowerCase())
      .pipe(z.string().regex(/^[a-z0-9_]{3,20}$/, 'Use 3-20 letters, numbers, or underscores')),
    z.literal(''),
  ]),
  bio: z.string().trim().max(160, 'Keep your bio to 160 characters or fewer'),
  about: z.string().trim().max(2000, 'Use 2,000 characters or fewer'),
  phone: z.union([z.string().trim().min(7).max(32), z.literal('')]),
});
