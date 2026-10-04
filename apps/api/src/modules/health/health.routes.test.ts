import { errorEnvelopeSchema } from '@agapay/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

const app = createApp();

describe('health endpoints (OPS-02)', () => {
  it('reports liveness without touching any dependency', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('echoes a request id back so a user can quote it', async () => {
    const res = await request(app).get('/api/v1/health').set('x-request-id', 'test-request-id');
    expect(res.headers['x-request-id']).toBe('test-request-id');
  });

  it('generates a request id when the client sends none', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });
});

describe('unknown routes', () => {
  it('returns the generic error envelope, not a stack trace', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);

    const body = errorEnvelopeSchema.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain('at ');
  });
});
