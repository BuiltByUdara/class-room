import nodemailer from 'nodemailer';
import type { Config } from '../config.js';
export type SendMail = (email: string, link: string, invitation: boolean) => Promise<void>;
export function createMailer(config: Config): SendMail {
  const transport = nodemailer.createTransport({ host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE, auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined });
  return async (email, link, invitation) => { await transport.sendMail({ from: config.MAIL_FROM, to: email, subject: invitation ? 'Your tuition account invitation' : 'Reset your tuition password', text: `Set your password using this single-use link, valid for 30 minutes:\n${link}\nIf you did not expect this email, ignore it.` }); };
}
