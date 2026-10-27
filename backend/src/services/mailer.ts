import nodemailer from 'nodemailer';
import { getMicrosoftAccessToken, hasMicrosoftLogin } from './emailIngest/microsoftAuth.js';

// SMTP_PASS wins when set; otherwise an Outlook account signed in via `npm run mail:login`
// sends through Outlook's SMTP with OAuth2.
async function createTransport() {
  if (process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }

  if (await hasMicrosoftLogin()) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp-mail.outlook.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: { type: 'OAuth2', user: process.env.MAIL_USER, accessToken: await getMicrosoftAccessToken() }
    });
  }

  return null;
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = await createTransport();
  if (!transporter) {
    console.warn('Email not sent: no SMTP_PASS and no Outlook login configured');
    return false;
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.MAIL_USER || 'noreply@jobflow.app',
    to,
    subject,
    html
  });
  return true;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
