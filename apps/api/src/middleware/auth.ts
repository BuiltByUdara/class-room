import type { RequestHandler } from 'express';
import type { PublicUser, Role } from '@tuition/contracts';
import { Session, User } from '../db/models.js';
import { hashToken, publicUser } from '../modules/auth/service.js';
import { HttpError } from '../lib/errors.js';
declare global { namespace Express { interface Request { user?: PublicUser } } }
export const authenticate = (cookieName: string): RequestHandler => async (req, _res, next) => {
  const token = req.cookies[cookieName];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in');
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  const user = session && await User.findOne({ _id: session.user, status: 'active', credentialVersion: session.credentialVersion });
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in');
  req.user = publicUser(user); next();
};
export const authorize = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in');
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'FORBIDDEN', 'You do not have permission');
  next();
};
