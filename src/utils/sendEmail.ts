import nodemailer from 'nodemailer';
import { logger } from './logger.js';

// Brevo HTTP API path (preferred — same provider as cortexbuild-field;
// 300/day free; domain auth already on @cortexbuildpro.com).
// Falls back to nodemailer/SMTP if BREVO_API_KEY is unset.

const BREVO_API = 'https://api.brevo.com/v3/smtp/email';

const brevoKey = process.env.BREVO_API_KEY;
const fromAddr = process.env.EMAIL_FROM || 'noreply@cortexbuildpro.com';
const fromName = process.env.EMAIL_FROM_NAME || 'BuildTrack';

const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const smtpTransporter = smtpHost && smtpUser && smtpPass
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      auth: { user: smtpUser, pass: smtpPass },
      secure: smtpPort === 465,
    })
  : null;

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

async function sendViaBrevo(params: SendEmailParams): Promise<void> {
  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: {
      'api-key': brevoKey!,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: fromAddr, name: fromName },
      to: [{ email: params.to }],
      subject: params.subject,
      textContent: params.text,
      htmlContent: params.html,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Brevo send failed: ${res.status} ${errBody.slice(0, 200)}`);
  }
}

async function sendViaSmtp(params: SendEmailParams): Promise<void> {
  const fromHeader = `${fromName} <${fromAddr}>`;
  await smtpTransporter!.sendMail({
    from: fromHeader,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (brevoKey) {
    try {
      await sendViaBrevo(params);
      logger.info(`[Email] Brevo sent to ${params.to}: ${params.subject}`);
      return;
    } catch (err) {
      logger.error(`[Email] Brevo failed to ${params.to}: ${(err as Error).message}`);
      throw err;
    }
  }

  if (smtpTransporter) {
    try {
      await sendViaSmtp(params);
      logger.info(`[Email] SMTP sent to ${params.to}: ${params.subject}`);
      return;
    } catch (err) {
      logger.error(`[Email] SMTP failed to ${params.to}: ${(err as Error).message}`);
      throw err;
    }
  }

  // No transport configured.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'No email transport configured (set BREVO_API_KEY or SMTP_HOST/USER/PASS); cannot deliver in production.',
    );
  }
  logger.warn(
    `[Email] No transport configured — would send to ${params.to}: ${params.subject}`,
  );
}
