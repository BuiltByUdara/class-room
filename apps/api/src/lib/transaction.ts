import mongoose, { type ClientSession } from 'mongoose';
import { AdministrationLock, AuditLog, User } from '../db/models.js';
import type { PublicUser } from '@tuition/contracts';
import { HttpError } from './errors.js';
export async function administrativeWrite<T>(actor: PublicUser, action: string, operation: (session: ClientSession) => Promise<T>): Promise<T> {
  // Outside the transaction: create a stable lock document once. Atomic upsert is idempotent.
  try { await AdministrationLock.updateOne({ _id: 'administration' }, { $setOnInsert: { version: 0 } }, { upsert: true }); }
  catch (error) { if (!(error instanceof mongoose.mongo.MongoServerError) || error.code !== 11000) throw error; }
  return mongoose.connection.transaction(async session => {
    await AdministrationLock.updateOne({ _id: 'administration' }, { $inc: { version: 1 } }, { session });
    if (!await User.exists({ _id: actor.id, status: 'active', role: actor.role }).session(session)) throw new HttpError(403, 'FORBIDDEN', 'Your permissions changed. Sign in again.');
    const result = await operation(session);
    await AuditLog.create([{ actor: actor.id, action }], { session });
    return result;
  });
}
