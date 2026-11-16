import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { requireTransactionTopology } from '../src/lib/readiness.js';
import { requestContext } from '../src/middleware/request-context.js';
import { errorHandler } from '../src/lib/errors.js';

const config = readConfig({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost/test', SMTP_HOST: 'localhost', MAIL_FROM: 'test@example.com' });
describe('Release boundaries', () => {
  it('rejects standalone MongoDB and missing sessions before accepting traffic', () => {
    expect(() => requireTransactionTopology({ logicalSessionTimeoutMinutes: 30 })).toThrow('replica set');
    expect(() => requireTransactionTopology({ setName: 'rs0' })).toThrow();
    expect(() => requireTransactionTopology({ setName: 'rs0', logicalSessionTimeoutMinutes: 30 })).not.toThrow();
    expect(() => requireTransactionTopology({ msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30 })).not.toThrow();
  });
  it('keeps parse errors and denied origins uncached with generated request IDs', async () => {
    const app = createApp(config, async () => {});
    const denied = await request(app).get('/api/health').set('Origin', 'https://unrelated.example').set('X-Request-ID', 'caller-controlled');
    expect(denied.status).toBe(403);
    expect(denied.headers['cache-control']).toBe('no-store');
    expect(denied.headers['x-request-id']).not.toBe('caller-controlled');
    const malformed = await request(app).post('/api/auth/login').set('Origin', config.APP_ORIGIN).set('Content-Type', 'application/json').send('{');
    expect(malformed.status).toBe(400);
    expect(malformed.headers['cache-control']).toBe('no-store');
    expect(malformed.headers['access-control-expose-headers']).toBe('X-Request-ID');
    expect(malformed.headers['x-request-id']).not.toBe(denied.headers['x-request-id']);
  });
  it('correlates failures without exposing or logging secrets', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const app = express(); app.use(requestContext);
      app.get('/failure', () => { throw new Error('secret-database-password'); }); app.use(errorHandler);
      const response = await request(app).get('/failure?token=secret-reset-token');
      expect(response.status).toBe(500);
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
      expect(JSON.stringify(response.body)).not.toContain('secret');
      expect(log).toHaveBeenCalledOnce();
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    } finally { log.mockRestore(); }
  });
});
