import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorEnvelopeSchema } from '@agapay/shared';
import { createApp } from '../../app.js';
import { errorMiddleware } from './error-middleware.js';
import { logger } from '../logger.js';

afterEach(() => vi.restoreAllMocks());
describe('M5E HTTP hardening', () => {
  it('returns safe JSON envelopes for malformed and oversized bodies', async () => {
    const app = createApp();
    for (const [body, status] of [
      ['{"private":"secret",', 400],
      [JSON.stringify({ private: 'secret'.repeat(20000) }), 413],
    ] as const) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send(body);
      expect(res.status).toBe(status);
      expect(errorEnvelopeSchema.parse(res.body).error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('secret');
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
  it('does not log raw unexpected error values or return stack traces', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const app = express();
    app.get('/failure', () => {
      throw new Error('PRIVATE_EMAIL_TOKEN_AND_DRIVER_VALUES');
    });
    app.use(errorMiddleware);
    const res = await request(app).get('/failure');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE');
    expect(log).toHaveBeenCalledWith({ requestId: 'unknown' }, 'unhandled error');
  });
  it('bounds untrusted request IDs while retaining ordinary correlation IDs', async () => {
    const app = createApp();
    for (const id of ['x'.repeat(100), 'private@example.invalid']) {
      const res = await request(app).get('/api/v1/health').set('x-request-id', id);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
  it('enforces public tracking limits and returns the actual hourly reset', async () => {
    const app = createApp();
    const code = 'REQ-M5E-TEST';
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post('/api/v1/public/track')
        .set('X-Forwarded-For', `198.18.1.${i + 1}`)
        .send({ code: i % 2 ? ` ${code.toLowerCase()} ` : code, email: 'invalid' });
      if (i < 5) expect(res.status).toBe(400);
      else {
        expect(res.status).toBe(429);
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(3500);
        expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(3600);
        expect(errorEnvelopeSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
      }
    }
  });
  it('normalizes the public daily email budget across IPs without accessing the database', async () => {
    const app = createApp();
    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/v1/public/assistance-requests')
        .set('X-Forwarded-For', `198.18.2.${i + 1}`)
        .send({ email: i % 2 ? ' LIMIT@EXAMPLE.INVALID ' : 'limit@example.invalid' });
      expect(res.status).toBe(i < 3 ? 400 : 429);
      if (i === 3) expect(Number(res.headers['retry-after'])).toBeGreaterThan(86000);
    }
  });
  it('reports an hourly reset for password-recovery abuse', async () => {
    const app = createApp();
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .set('X-Forwarded-For', '198.18.3.1')
        .send({ email: 'invalid' });
      expect(res.status).toBe(i < 5 ? 400 : 429);
      if (i === 5) expect(Number(res.headers['retry-after'])).toBeGreaterThan(3500);
    }
  });
  it('enforces the global per-IP budget with the standard error envelope', async () => {
    const app = createApp();
    for (let i = 0; i < 301; i++) {
      const res = await request(app).get('/api/v1/health').set('X-Forwarded-For', '198.18.4.1');
      expect(res.status).toBe(i < 300 ? 200 : 429);
      if (i === 300) expect(errorEnvelopeSchema.parse(res.body).error.code).toBe('RATE_LIMITED');
    }
  });
});
