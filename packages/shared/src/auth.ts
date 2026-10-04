import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'iloveyou',
  'admin123',
  'welcome1',
  'letmein1',
  'agapay123',
]);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: 'That password is too common. Choose something less predictable.',
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254);

export const loginPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

export const phoneSchema = z
  .string()
  .regex(/^09\d{9}$/, 'Use an 11-digit Philippine mobile number, e.g. 09171234567.')
  .optional();

const tokenSchema = z.string().min(20).max(200);

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    phone: phoneSchema,
  })
  .strict();

export const loginSchema = z.object({ email: emailSchema, password: loginPasswordSchema }).strict();

export const verifyEmailSchema = z.object({ token: tokenSchema }).strict();

export const resendVerificationSchema = z.object({ email: emailSchema }).strict();

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordSchema = z
  .object({ token: tokenSchema, password: passwordSchema })
  .strict();

export const changePasswordSchema = z
  .object({ currentPassword: loginPasswordSchema, newPassword: passwordSchema })
  .strict();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    phone: phoneSchema,
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  phone: z.string().nullable(),
  emailVerified: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type AuthUserDto = z.infer<typeof authUserSchema>;

export const authUserResponseSchema = z.object({ data: authUserSchema });

export type AuthUserResponse = z.infer<typeof authUserResponseSchema>;

export const accessTokenResponseSchema = z.object({
  data: z.object({
    accessToken: z.string(),
    expiresIn: z.number(),
    user: authUserSchema,
  }),
});

export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;

export const registeredUserResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
  }),
});

export type RegisteredUserResponse = z.infer<typeof registeredUserResponseSchema>;

export const verifyEmailResponseSchema = z.object({
  data: z.object({ verified: z.boolean() }),
});

export type VerifyEmailResponse = z.infer<typeof verifyEmailResponseSchema>;
