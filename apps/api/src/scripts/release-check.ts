import mongoose from 'mongoose';
import { readConfig } from '../config.js';
import { checkDatabase } from '../lib/readiness.js';
import '../db/models.js';

// Read-only by default. Explicit index creation never drops existing indexes.
const apply = process.argv.includes('--apply-indexes');
try {
  const config = readConfig();
  await mongoose.connect(config.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  await checkDatabase();
  let missing = 0;
  for (const model of Object.values(mongoose.models)) {
    if (apply) await model.createIndexes();
    const diff = await model.diffIndexes();
    missing += diff.toCreate.length;
    console.log(JSON.stringify({ collection: model.collection.name, missingIndexes: diff.toCreate, extraIndexes: diff.toDrop }));
  }
  console.log(JSON.stringify({ event: 'release.database_check', status: missing ? 'missing_indexes' : 'passed' }));
  if (missing) process.exitCode = 1;
} catch {
  // Driver/config errors may contain connection strings or credentials.
  console.error('Release check failed. Check configuration, MongoDB topology, permissions, connectivity and index conflicts.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
