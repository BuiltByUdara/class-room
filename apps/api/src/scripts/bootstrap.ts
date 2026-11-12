import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { inviteSchema, passwordSchema } from '@tuition/contracts';
import { readConfig } from '../config.js';
import { User, AuditLog } from '../db/models.js';
const config = readConfig();
const input = inviteSchema.parse({ name: process.env.BOOTSTRAP_NAME, email: process.env.BOOTSTRAP_EMAIL, role: 'admin' });
const password = passwordSchema.parse(process.env.BOOTSTRAP_PASSWORD);
await mongoose.connect(config.MONGODB_URI);
try {
  await User.init();
  if (await User.exists({ role: 'admin' })) throw new Error('An admin already exists; bootstrap refused');
  const user = await User.create({ ...input, status: 'active', passwordHash: await bcrypt.hash(password, 12) });
  await AuditLog.create({ actor: user._id, target: user._id, action: 'admin.bootstrapped' });
  console.log('Administrator created. Remove bootstrap credentials from .env.');
} finally { await mongoose.disconnect(); }
