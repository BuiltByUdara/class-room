import mongoose from 'mongoose';
import { checkDatabase } from './lib/readiness.js';
import { readConfig } from './config.js';
import { createApp } from './app.js';
import { createMailer } from './lib/mail.js';
import { expireAttempts } from './modules/quizzes/service.js';
async function main() {
const config = readConfig();
await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10000, autoIndex: config.NODE_ENV !== 'production' });
await checkDatabase();
await Promise.all(Object.values(mongoose.models).map(model => model.init()));
if (config.NODE_ENV === 'production') {
  for (const model of Object.values(mongoose.models)) {
    if ((await model.diffIndexes()).toCreate.length) throw new Error('Required database indexes are missing. Run the release index check before starting.');
  }
}
const server = createApp(config, createMailer(config)).listen(config.PORT, config.HOST, () => console.log(`API listening on ${config.HOST}:${config.PORT}`));
let sweep:Promise<void>|undefined;
const tick=()=>{if(!sweep) sweep=expireAttempts().catch(()=>console.error('Attempt expiry sweep failed; will retry')).finally(()=>{sweep=undefined;});};
const expiryTimer=setInterval(tick,5000); expiryTimer.unref(); tick();
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(expiryTimer);
  console.log(JSON.stringify({ event: 'shutdown.started' }));
  const deadline = setTimeout(() => {
    console.error(JSON.stringify({ event: 'shutdown.timeout' }));
    server.closeAllConnections();
    process.exit(1);
  }, 30000);
  deadline.unref();
  server.close(async () => {
    try {
      await sweep;
      await mongoose.disconnect();
      clearTimeout(deadline);
      process.exit(0);
    } catch { process.exit(1); }
  });
}
server.requestTimeout = 30000;
server.headersTimeout = 15000;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void shutdown(); });
}
main().catch(async () => {
  console.error('API startup failed. Check configuration, database connectivity, transaction support and required indexes.');
  await mongoose.disconnect();
  process.exitCode = 1;
});
