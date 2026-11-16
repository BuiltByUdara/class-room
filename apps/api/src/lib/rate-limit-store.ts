import { createHash } from 'node:crypto';
import type { Store, Options } from 'express-rate-limit';
import { RateLimitCounter } from '../db/models.js';
import { HttpError } from './errors.js';

export class MongoRateLimitStore implements Store {
  localKeys = false;
  windowMs = 15 * 60000;
  constructor(public prefix: string) {}
  init(options: Options) { this.windowMs = options.windowMs; }
  private id(key: string) { return createHash('sha256').update(`${this.prefix}:${key}`).digest('hex'); }
  async increment(key: string) {
    try {
      if (RateLimitCounter.db.readyState !== 1) throw new Error('Disconnected');
      // The database clock and one atomic update define each fixed-duration window.
      // Expired records reset here; TTL cleanup is not a correctness requirement.
      const expired = { $lte: [{ $ifNull: ['$expiresAt', new Date(0)] }, '$$NOW'] };
      const update = () => RateLimitCounter.findOneAndUpdate({ _id: this.id(key) }, [{ $set: {
        hits: { $cond: [expired, 1, { $add: ['$hits', 1] }] },
        expiresAt: { $cond: [expired, { $add: ['$$NOW', this.windowMs] }, '$expiresAt'] },
      } }], { upsert: true, new: true, maxTimeMS: 5000, writeConcern: { w: 'majority', wtimeout: 5000 } });
      let counter;
      try { counter = await update(); }
      catch (error) {
        // Concurrent first requests can race on the unique _id insert.
        if ((error as { code?: number }).code !== 11000) throw error;
        counter = await update();
      }
      return { totalHits: counter!.hits, resetTime: counter!.expiresAt };
    } catch { throw new HttpError(503, 'RATE_LIMIT_UNAVAILABLE', 'Sign-in services are temporarily unavailable. Please try again.'); }
  }
  async decrement(key: string) {
    await RateLimitCounter.updateOne({ _id: this.id(key), hits: { $gt: 0 }, $expr: { $gt: ['$expiresAt', '$$NOW'] } }, { $inc: { hits: -1 } }, { maxTimeMS: 5000 });
  }
  async resetKey(key: string) { await RateLimitCounter.deleteOne({ _id: this.id(key) }, { maxTimeMS: 5000 }); }
}
