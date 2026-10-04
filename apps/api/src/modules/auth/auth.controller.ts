import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
  type AuthUserDto,
} from '@agapay/shared';
import { systemClock } from '../../lib/clock.js';
import { env, isProduction } from '../../lib/env.js';
import { unauthenticated, validationError } from '../../lib/errors.js';
import { REFRESH_COOKIE_NAME, REFRESH_TOKEN_TTL_MS } from './auth.config.js';
import * as service from './auth.service.js';
import type { RequestMeta } from './auth.service.js';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/api/v1/auth',
    domain:
      env.COOKIE_DOMAIN === undefined || env.COOKIE_DOMAIN === '' ? undefined : env.COOKIE_DOMAIN,
  };
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

function metaFrom(req: Request): RequestMeta {
  return { userAgent: req.get('user-agent') ?? undefined, ip: req.ip };
}

function toDto(user: service.AuthUser): AuthUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    emailVerified: user.emailVerified,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

function requireAuth(req: Request): service.AuthUser['id'] {
  if (req.auth === undefined) throw unauthenticated();
  return req.auth.userId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies: unknown = req.cookies;
  if (!isRecord(cookies)) return undefined;
  const value = cookies[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function register(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const user = await service.register(parsed.data, systemClock);
  res.status(201).json({ data: user });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  await service.verifyEmail(parsed.data.token, systemClock);
  res.status(200).json({ data: { verified: true } });
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const parsed = resendVerificationSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  await service.resendVerification(parsed.data.email, systemClock);
  res.status(204).send();
}

export async function login(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const result = await service.login(parsed.data, metaFrom(req), systemClock);
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    data: {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: toDto(result.user),
    },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const raw = readRefreshCookie(req);
  if (raw === undefined) throw unauthenticated();

  const result = await service.refresh(raw, metaFrom(req), systemClock);
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    data: {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: toDto(result.user),
    },
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const raw = readRefreshCookie(req);
  if (raw !== undefined) {
    await service.logout(raw, systemClock);
  }

  clearRefreshCookie(res);
  res.status(204).send();
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  await service.forgotPassword(parsed.data.email, systemClock);
  res.status(204).send();
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  await service.resetPassword(parsed.data, systemClock);
  res.status(204).send();
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  await service.changePassword(requireAuth(req), parsed.data, systemClock);
  clearRefreshCookie(res);
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: toDto(await service.getMe(requireAuth(req))) });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const body: unknown = req.body;
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) throw validationError(parsed.error.flatten());

  const user = await service.updateProfile(requireAuth(req), parsed.data);
  res.status(200).json({ data: toDto(user) });
}
