import { z } from 'zod';
import { UserRole } from './enums.js';
import { authUserSchema, emailSchema } from './auth.js';

export const userListQuerySchema = z
  .object({
    role: z.enum([UserRole.DONOR, UserRole.STAFF, UserRole.ADMIN]).optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    q: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const createUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    role: z.enum([UserRole.STAFF, UserRole.ADMIN]),
    phone: z
      .string()
      .regex(/^09\d{9}$/, 'Use an 11-digit Philippine mobile number, e.g. 09171234567.')
      .optional(),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.enum([UserRole.DONOR, UserRole.STAFF, UserRole.ADMIN]).optional(),
    isActive: z.boolean().optional(),
    phone: z
      .string()
      .regex(/^09\d{9}$/, 'Use an 11-digit Philippine mobile number, e.g. 09171234567.')
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to change.',
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const adminUserSchema = authUserSchema.extend({ lastLoginAt: z.string().nullable() });

export const adminUserResponseSchema = z.object({ data: adminUserSchema });

export const userListResponseSchema = z.object({
  data: z.object({
    items: z.array(adminUserSchema),
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  }),
});

export type UserListResponse = z.infer<typeof userListResponseSchema>;
