import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { User, Session } from '../src/db/models.js';
import { hashToken } from '../src/modules/auth/service.js';
let database: MongoMemoryServer;
const emails: string[] = [];
const config = readConfig({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost/test', SMTP_HOST: 'localhost', MAIL_FROM: 'test@example.com' });
let app = createApp(config, async (_email, link) => { emails.push(link); });
const password = 'a-long-test-passphrase';
let passwordHash: string;
const post = (path: string) => request(app).post(path).set('Origin', config.APP_ORIGIN).set('X-Requested-With', 'tuition-web');
async function user(role = 'student') { return User.create({ name: 'Test Member', email: `${role}@example.com`, role, status: 'active', passwordHash }); }
async function signIn(role = 'student') { const result = await post('/api/auth/login').send({ email: `${role}@example.com`, password }); expect(result.status).toBe(200); return result.headers['set-cookie'][0].split(';')[0] as string; }
beforeAll(async () => { database = await MongoMemoryServer.create(); await mongoose.connect(database.getUri()); await Promise.all([User.init(), Session.init()]); passwordHash = await bcrypt.hash(password, 12); }, 120000);
beforeEach(async () => { await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({}))); emails.length = 0; app = createApp(config, async (_email, link) => { emails.push(link); }); });
afterAll(async () => { await mongoose.disconnect(); await database?.stop(); });
describe('Authentication and access boundaries', () => {
  it('logs in with an HttpOnly cookie, returns a safe user, and revokes logout', async () => {
    await user(); const result = await post('/api/auth/login').send({ email: 'STUDENT@example.com', password });
    expect(result.status).toBe(200); expect(result.headers['set-cookie'][0]).toContain('HttpOnly'); expect(result.headers['set-cookie'][0]).toContain('SameSite=Strict');
    expect(result.body.data.user).not.toHaveProperty('passwordHash');
    const cookie = result.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);
    expect((await post('/api/auth/logout').set('Cookie', cookie).send({})).status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
  it('rejects wrong passwords, inactive users, and missing authentication', async () => {
    const member = await user();
    expect((await post('/api/auth/login').send({ email: member.email, password: 'incorrect' })).status).toBe(401);
    await User.updateOne({ _id: member._id }, { status: 'inactive' });
    expect((await post('/api/auth/login').send({ email: member.email, password })).status).toBe(401);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
  it.each(['student','teacher','parent'])('denies %s administrator actions', async role => {
    await user(role); const cookie = await signIn(role);
    expect((await post('/api/users/invitations').set('Cookie', cookie).send({ name: 'New User', email: 'new@example.com', role: 'admin' })).status).toBe(403);
  });
  it('invites a user, activates their account, consumes token once, and invalidates old sessions', async () => {
    await user('admin'); const adminCookie = await signIn('admin');
    const response = await post('/api/users/invitations').set('Cookie', adminCookie).send({ name: 'New Student', email: 'new@example.com', role: 'student' });
    expect(response.status).toBe(201); expect(emails).toHaveLength(1);
    const token = new URLSearchParams(new URL(emails[0]).hash.slice(1)).get('token');
    const pending = await User.findOne({ email: 'new@example.com' }).select('+resetTokenHash');
    expect(pending!.resetTokenHash).toBe(hashToken(token!));
    expect((await post('/api/auth/password/reset').send({ token, password })).status).toBe(204);
    expect((await post('/api/auth/password/reset').send({ token, password })).status).toBe(400);
    const login = await post('/api/auth/login').send({ email: 'new@example.com', password }); expect(login.status).toBe(200);
    await post('/api/auth/password/forgot').send({ email: 'new@example.com' });
    const nextToken = new URLSearchParams(new URL(emails[1]).hash.slice(1)).get('token');
    expect((await post('/api/auth/password/reset').send({ token: nextToken, password: 'another-long-password' })).status).toBe(204);
    expect((await request(app).get('/api/auth/me').set('Cookie', login.headers['set-cookie'][0].split(';')[0])).status).toBe(401);
  });
  it('enforces expiry independently of MongoDB TTL cleanup and current account status', async () => {
    const member = await user(); const cookie = await signIn();
    await Session.updateMany({}, { expiresAt: new Date(0) });
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    const nextCookie = await signIn(); await User.updateOne({ _id: member._id }, { status: 'inactive' });
    expect((await request(app).get('/api/auth/me').set('Cookie', nextCookie)).status).toBe(401);
  });
  it('rejects expired reset tokens and weak passwords', async () => {
    await user(); await post('/api/auth/password/forgot').send({ email: 'student@example.com' });
    const token = new URLSearchParams(new URL(emails[0]).hash.slice(1)).get('token');
    expect((await post('/api/auth/password/reset').send({ token, password: 'short' })).status).toBe(400);
    await User.updateMany({}, { resetExpiresAt: new Date(0) });
    expect((await post('/api/auth/password/reset').send({ token, password })).status).toBe(400);
  });
  it('returns the same reset response for unknown and known accounts', async () => {
    await user(); const known = await post('/api/auth/password/forgot').send({ email: 'student@example.com' });
    const unknown = await post('/api/auth/password/forgot').send({ email: 'unknown@example.com' });
    expect(known.status).toBe(202); expect(known.body).toEqual(unknown.body);
  });
  it('rejects cross-origin writes, untrusted fields and malformed JSON', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(403);
    expect((await post('/api/auth/login').set('Origin', 'https://evil.example').send({})).status).toBe(403);
    expect((await post('/api/auth/login').send({ email: 'test@example.com', password, role: 'admin' })).status).toBe(400);
    expect((await post('/api/auth/login').set('Content-Type', 'application/json').send('{')).status).toBe(400);
  });
  it('rate limits login requests', async () => { for (let i = 0; i < 10; i++) await post('/api/auth/login').send({}); expect((await post('/api/auth/login').send({})).status).toBe(429); });
  it('allows only one concurrent reset with the same token', async () => {
    await user(); await post('/api/auth/password/forgot').send({ email: 'student@example.com' });
    const token = new URLSearchParams(new URL(emails[0]).hash.slice(1)).get('token');
    const results = await Promise.all([post('/api/auth/password/reset').send({ token, password }), post('/api/auth/password/reset').send({ token, password: 'a-different-long-passphrase' })]);
    expect(results.map(r => r.status).sort()).toEqual([204, 400]);
  });
  it('sets a secure host-only cookie in production', async () => {
    await user(); const production = createApp({ ...config, NODE_ENV: 'production', APP_ORIGIN: 'https://tuition.example' }, async () => {});
    const response = await request(production).post('/api/auth/login').set('Origin', 'https://tuition.example').set('X-Requested-With', 'tuition-web').send({ email: 'student@example.com', password });
    expect(response.status).toBe(200); const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('__Host-tuition='); expect(cookie).toContain('Secure'); expect(cookie).toContain('Path=/'); expect(cookie).not.toContain('Domain=');
  });
  it('has no public registration route', async () => { expect((await post('/api/auth/register').send({})).status).toBe(404); });
  it('permits credentialed preflights only from the configured frontend', async () => {
    const response = await request(app).options('/api/auth/login').set('Origin', config.APP_ORIGIN).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,x-requested-with');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(config.APP_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers.vary).toContain('Origin');
    const rejected = await request(app).options('/api/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(rejected.status).toBe(403); expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
    expect((await request(app).options('/api/auth/login').set('Origin', config.APP_ORIGIN).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization')).status).toBe(403);
  });
  it('preserves the login session across allowed-origin API calls and logout', async () => {
    await user(); const login = await post('/api/auth/login').send({ email: 'student@example.com', password });
    expect(login.headers['access-control-allow-origin']).toBe(config.APP_ORIGIN);
    expect(login.headers['access-control-allow-credentials']).toBe('true');
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie).set('Origin', config.APP_ORIGIN);
    expect(me.status).toBe(200); expect(me.headers['access-control-allow-origin']).toBe(config.APP_ORIGIN);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie).set('Origin', 'https://evil.example')).status).toBe(403);
    const logout = await post('/api/auth/logout').set('Cookie', cookie).send({});
    expect(logout.status).toBe(204); expect(logout.headers['access-control-allow-credentials']).toBe('true');
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie).set('Origin', config.APP_ORIGIN)).status).toBe(401);
  });
  it('supports Secure SameSite=None cookies for cross-site production deployments', async () => {
    await user(); const production = createApp({ ...config, NODE_ENV: 'production', COOKIE_SAME_SITE: 'none', APP_ORIGIN: 'https://web.example' }, async () => {});
    const response = await request(production).post('/api/auth/login').set('Origin', 'https://web.example').set('X-Requested-With', 'tuition-web').send({ email: 'student@example.com', password });
    expect(response.status).toBe(200); expect(response.headers['set-cookie'][0]).toContain('SameSite=None'); expect(response.headers['set-cookie'][0]).toContain('Secure');
    const logout = await request(production).post('/api/auth/logout').set('Origin', 'https://web.example').set('X-Requested-With', 'tuition-web').send({});
    expect(logout.headers['set-cookie'][0]).toContain('SameSite=None');
  });
  it('rejects insecure cross-site cookie configuration', () => {
    expect(() => readConfig({ MONGODB_URI: 'mongodb://localhost/test', SMTP_HOST: 'localhost', MAIL_FROM: 'test@example.com', COOKIE_SAME_SITE: 'none' })).toThrow('SameSite=None');
    expect(() => readConfig({ MONGODB_URI: 'mongodb://localhost/test', SMTP_HOST: 'localhost', MAIL_FROM: 'test@example.com', TRUST_PROXY_HOPS: '-1' })).toThrow();
  });
});
