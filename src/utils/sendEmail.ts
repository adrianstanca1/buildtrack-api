import nodemailer from 'nodemailer';
import { logger } from './logger.js';

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || '587', 10);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.EMAIL_FROM || (user ? `BuildTrack <${user}>` : 'BuildTrack <noreply@buildtrack.cortexbuildpro.com>');

const transporter = host && user && pass
  ? nodemailer.createTransport({ host, port, auth: { user, pass }, secure: port === 465 })
  : null;

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  if (!transporter) {
    logger.info(`[Email] SMTP not configured. Would send to ${params.to}: ${params.subject}`);
    return;
  }
  try {
    await transporter.sendMail({ from, to: params.to, subject: params.subject, text: params.text, html: params.html });
    logger.info(`[Email] Sent to ${params.to}: ${params.subject}`);
  } catch (err) {
    logger.error(`[Email] Failed to send to ${params.to}:`, err);
    throw err;
  }
}
