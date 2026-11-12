import mongoose from 'mongoose';
import { readConfig } from './config.js';
import { createApp } from './app.js';
import { createMailer } from './lib/mail.js';
const config = readConfig();
await mongoose.connect(config.MONGODB_URI);
await Promise.all(Object.values(mongoose.models).map(model => model.init()));
const server = createApp(config, createMailer(config)).listen(config.PORT, config.HOST, () => console.log(`API listening on ${config.HOST}:${config.PORT}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(() => { void mongoose.disconnect().then(() => process.exit(0)); }); });
