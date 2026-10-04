import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { env } from '../../lib/env.js';
import { ARGON2_MEMORY_COST, ARGON2_PARALLELISM, ARGON2_TIME_COST } from './auth.config.js';

const ARGON2ID = 2;

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: ARGON2ID,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
  });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let decoyHash: Promise<string> | undefined;

export async function spendPasswordTime(): Promise<void> {
  decoyHash ??= hashPassword(randomBytes(32).toString('hex'));
  await verifyPassword(await decoyHash, 'not-a-real-password');
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(`${env.JWT_ACCESS_SECRET}:${ip}`).digest('hex');
}
