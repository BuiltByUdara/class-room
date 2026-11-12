import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { loginSchema, resetSchema, resetRequestSchema, inviteSchema } from '@tuition/contracts';
import type { Config } from './config.js';
import type { SendMail } from './lib/mail.js';
import { errorHandler, HttpError } from './lib/errors.js';
import { User, Session, AuditLog } from './db/models.js';
import { authenticate, authorize } from './middleware/auth.js';
import { frontendCors } from './middleware/cors.js';
import { managementRouter } from './modules/classes/routes.js';
import { login, resetPassword, sendPasswordLink, hashToken, publicUser } from './modules/auth/service.js';
export function createApp(config: Config, sendMail: SendMail) {
  const app = express();
  const cookieName = config.NODE_ENV === 'production' ? '__Host-tuition' : 'tuition';
  const cookieOptions = { httpOnly: true, secure: config.NODE_ENV === 'production', sameSite: config.COOKIE_SAME_SITE, path: '/' };
  app.disable('x-powered-by');
  if (config.TRUST_PROXY_HOPS > 0) app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use('/api', frontendCors(config.APP_ORIGIN));
  app.use(express.json({ limit: '16kb' }), cookieParser());
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, _res, next) => {
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && (req.get('origin') !== config.APP_ORIGIN || req.get('x-requested-with') !== 'tuition-web')) throw new HttpError(403, 'INVALID_ORIGIN', 'Request origin could not be verified');
    next();
  });
  const limiter = (limit: number) => rateLimit({ windowMs: 15 * 60000, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again in 15 minutes.' } } });
  app.use('/api/auth', limiter(60));
  app.post('/api/auth/login', limiter(10), async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await login(input.email, input.password, config);
    if (typeof req.cookies[cookieName] === 'string') await Session.deleteOne({ tokenHash: hashToken(req.cookies[cookieName]) });
    res.cookie(cookieName, result.token, { ...cookieOptions, maxAge: config.SESSION_HOURS * 3600000 }).json({ data: { user: result.user } });
  });
  app.post('/api/auth/logout', async (req, res) => {
    if (typeof req.cookies[cookieName] === 'string') await Session.deleteOne({ tokenHash: hashToken(req.cookies[cookieName]) });
    res.clearCookie(cookieName, cookieOptions).status(204).end();
  });
  app.get('/api/auth/me', authenticate(cookieName), (req, res) => { res.json({ data: { user: req.user } }); });
  app.post('/api/auth/password/forgot', limiter(5), async (req, res) => {
    const { email } = resetRequestSchema.parse(req.body);
    const user = await User.findOne({ email, status: { $in: ['active','invited'] } });
    if (user) { try { await sendPasswordLink(user, config, sendMail, user.status === 'invited'); } catch { console.error('Password email delivery failed'); } }
    res.status(202).json({ data: { message: 'If the account is eligible, a password link will be emailed.' } });
  });
  app.post('/api/auth/password/reset', limiter(10), async (req, res) => { const input = resetSchema.parse(req.body); await resetPassword(input.token, input.password); res.clearCookie(cookieName, cookieOptions).status(204).end(); });
  app.post('/api/users/invitations', authenticate(cookieName), authorize('admin'), async (req, res) => {
    const input = inviteSchema.parse(req.body);
    const user = await User.create(input);
    await AuditLog.create({ actor: req.user!.id, target: user._id, action: 'user.invited' });
    try { await sendPasswordLink(user, config, sendMail, true); }
    catch { throw new HttpError(503, 'EMAIL_FAILED', 'Account created, but email delivery failed. Use the password reset form to resend.'); }
    res.status(201).json({ data: { user: publicUser(user) } });
  });
  app.get('/api/health', (_req, res) => { const ready = User.db.readyState === 1; res.status(ready ? 200 : 503).json({ data: { status: ready ? 'ready' : 'unavailable' } }); });
  app.use('/api/auth', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found')));
  app.use('/api', authenticate(cookieName), managementRouter);
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found')));
  app.use(errorHandler);
  return app;
}
