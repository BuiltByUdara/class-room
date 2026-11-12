import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1),
  SESSION_HOURS: z.coerce.number().min(1).max(72).default(12),
  SMTP_HOST: z.string().min(1), SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: z.enum(['true','false']).default('false').transform(v => v === 'true'),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(), MAIL_FROM: z.string().min(1),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = schema.parse(env);
  if (new URL(config.APP_ORIGIN).origin !== config.APP_ORIGIN) throw new Error('APP_ORIGIN must be an origin without a trailing slash');
  if (config.NODE_ENV === 'production' && !config.APP_ORIGIN.startsWith('https://')) throw new Error('Production requires HTTPS');
  if (!['http:', 'https:'].includes(new URL(config.APP_ORIGIN).protocol)) throw new Error('APP_ORIGIN must use HTTP or HTTPS');
  if (config.COOKIE_SAME_SITE === 'none' && config.NODE_ENV !== 'production') throw new Error('SameSite=None requires production HTTPS and Secure cookies');
  return config;
}
export type Config = ReturnType<typeof readConfig>;
