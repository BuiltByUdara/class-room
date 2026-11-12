import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { User, Session, AuditLog } from '../../db/models.js';
import { HttpError } from '../../lib/errors.js';
import type { SendMail } from '../../lib/mail.js';
import type { Config } from '../../config.js';
import type { PublicUser } from '@tuition/contracts';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export const publicUser = (user: InstanceType<typeof User>): PublicUser => ({ id: user.id, name: user.name, email: user.email, role: user.role });
const dummyHash = bcrypt.hashSync('timing-comparison-only', 12);
export async function login(email: string, password: string, config: Config) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const valid = await bcrypt.compare(password, user?.passwordHash || dummyHash);
  if (!user || !valid || user.status !== 'active') throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  const token = newToken();
  await Session.create({ tokenHash: hashToken(token), user: user._id, credentialVersion: user.credentialVersion, expiresAt: new Date(Date.now() + config.SESSION_HOURS * 3600000) });
  await AuditLog.create({ actor: user._id, action: 'auth.login', target: user._id });
  return { token, user: publicUser(user) };
}
export async function sendPasswordLink(user: InstanceType<typeof User>, config: Config, sendMail: SendMail, invitation: boolean) {
  const token = newToken();
  const digest = hashToken(token);
  await User.updateOne({ _id: user._id }, { $set: { resetTokenHash: digest, resetExpiresAt: new Date(Date.now() + 30 * 60000) } });
  try { await sendMail(user.email, `${config.APP_ORIGIN}/set-password#token=${token}`, invitation); }
  catch (error) {
    await User.updateOne({ _id: user._id, resetTokenHash: digest }, { $unset: { resetTokenHash: 1, resetExpiresAt: 1 } });
    throw error;
  }
}
export async function resetPassword(token: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  // Atomic token consumption prevents concurrent requests from reusing a link.
  const user = await User.findOneAndUpdate({ resetTokenHash: hashToken(token), resetExpiresAt: { $gt: new Date() }, status: { $in: ['active','invited'] } }, { $set: { passwordHash, status: 'active' }, $inc: { credentialVersion: 1 }, $unset: { resetTokenHash: 1, resetExpiresAt: 1 } }, { new: true });
  if (!user) throw new HttpError(400, 'INVALID_TOKEN', 'This link is invalid or expired. Request another link.');
  await Session.deleteMany({ user: user._id });
  await AuditLog.create({ actor: user._id, target: user._id, action: 'auth.password_changed' });
}
