import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { RateLimitCounter } from '../src/db/models.js';
import { MongoRateLimitStore } from '../src/lib/rate-limit-store.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

let database: MongoMemoryServer;
const config = readConfig({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost/test', SMTP_HOST: 'localhost', MAIL_FROM: 'test@example.com' });
beforeAll(async () => {
  database = await MongoMemoryServer.create(); await mongoose.connect(database.getUri()); await RateLimitCounter.init();
}, 120000);
beforeEach(async () => { await RateLimitCounter.deleteMany({}); });
afterAll(async () => { await mongoose.disconnect(); await database?.stop(); });

it('atomically counts concurrent requests across independent stores', async () => {
  const stores = [new MongoRateLimitStore('login'), new MongoRateLimitStore('login')];
  const results = await Promise.all(Array.from({ length: 40 }, (_, i) => stores[i % 2].increment('192.0.2.1')));
  expect(results.map(r => r.totalHits).sort((a, b) => a - b)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  expect(new Set(results.map(r => r.resetTime.getTime())).size).toBe(1);
  expect(await RateLimitCounter.countDocuments()).toBe(1);
  expect((await RateLimitCounter.findOne())!._id).not.toContain('192.0.2.1');
});
it('resets expired counters without waiting for TTL deletion', async () => {
  const store = new MongoRateLimitStore('login'); await store.increment('client');
  await RateLimitCounter.updateMany({}, { expiresAt: new Date(0), hits: 999 });
  const result = await store.increment('client'); expect(result.totalHits).toBe(1);
  expect(result.resetTime.getTime()).toBeGreaterThan(Date.now());
});
it('isolates clients and endpoint budgets and supports decrement/reset', async () => {
  const login = new MongoRateLimitStore('login'); const forgot = new MongoRateLimitStore('forgot');
  await login.increment('one'); await login.increment('one');
  expect((await forgot.increment('one')).totalHits).toBe(1);
  expect((await login.increment('two')).totalHits).toBe(1);
  await login.decrement('one'); expect((await login.increment('one')).totalHits).toBe(2);
  await login.resetKey('one'); expect((await login.increment('one')).totalHits).toBe(1);
});
it('enforces a single budget across API instances and a recreated app', async () => {
  const apps = [createApp(config, async () => {}), createApp(config, async () => {})];
  const post = (app: ReturnType<typeof createApp>) => request(app).post('/api/auth/login').set('Origin', config.APP_ORIGIN).set('X-Requested-With', 'tuition-web').send({});
  for (let i = 0; i < 10; i++) expect((await post(apps[i % 2])).status).toBe(400);
  const blocked = await post(createApp(config, async () => {}));
  expect(blocked.status).toBe(429); expect(blocked.headers['retry-after']).toBeDefined();
  expect(blocked.body.error.code).toBe('RATE_LIMIT');
});
it('fails closed with a safe 503 when the counter database fails', async () => {
  const failure = vi.spyOn(RateLimitCounter, 'findOneAndUpdate').mockImplementation(() => { throw new Error('secret-connection-details'); });
  try {
    const app = createApp(config, async () => {});
    const response = await request(app).post('/api/auth/login').set('Origin', config.APP_ORIGIN).set('X-Requested-With', 'tuition-web').send({});
    expect(response.status).toBe(503); expect(response.body.error.code).toBe('RATE_LIMIT_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  } finally { failure.mockRestore(); }
});
