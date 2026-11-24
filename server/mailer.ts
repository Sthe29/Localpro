import nodemailer from 'nodemailer';

export interface EmailSendResult {
  configured: boolean;
  delivered: boolean;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getSmtpConfig(): SmtpConfig | null {
  const gmailUser = process.env.GMAIL_USER?.trim() || '';
  const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

  if (gmailUser && gmailAppPassword) {
    const from = process.env.SMTP_FROM?.trim() || `LocalPro <${gmailUser}>`;
    return {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: gmailUser,
      pass: gmailAppPassword,
      from,
    };
  }

  const host = process.env.SMTP_HOST?.trim() || '';
  if (!host) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER?.trim() || '';
  const rawPass = process.env.SMTP_PASS || '';
  const pass = host.toLowerCase() === 'smtp.gmail.com' ? rawPass.replace(/\s+/g, '') : rawPass;
  const from =
    process.env.SMTP_FROM?.trim() ||
    (user ? `LocalPro <${user}>` : 'LocalPro <no-reply@localpro.local>');

  return { host, port, secure, user, pass, from };
}

export function isSmtpConfigured(): boolean {
  return getSmtpConfig() !== null;
}

async function sendMail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailSendResult> {
  const config = getSmtpConfig();
  if (!config) {
    return { configured: false, delivered: false };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });

    await transporter.sendMail({
      from: config.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    return { configured: true, delivered: true };
  } catch (err) {
    console.error(
      'LocalPro SMTP delivery failed:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    return { configured: true, delivered: false };
  }
}

export async function sendPasswordResetEmail(params: {
  to: string;
  fullName: string;
  resetUrl: string;
  rawToken: string;
  expiresMinutes: number;
}): Promise<EmailSendResult> {
  const safeName = escapeHtml(params.fullName);
  const safeUrl = escapeHtml(params.resetUrl);
  const safeToken = escapeHtml(params.rawToken);

  return sendMail({
    to: params.to,
    subject: 'LocalPro — Password reset request',
    text: [
      `Hi ${params.fullName},`,
      '',
      'We received a request to reset the password on your LocalPro account.',
      `Open the link below within ${params.expiresMinutes} minutes to set a new password:`,
      params.resetUrl,
      '',
      `Or enter this single-use reset token on the login screen: ${params.rawToken}`,
      '',
      'If you did not request a password reset, you can safely ignore this message. Your password has not been changed.',
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0F172A; line-height: 1.6;">
        <h2 style="margin: 0 0 12px; color: #0B1F3A;">LocalPro Password Reset</h2>
        <p>Hi ${safeName},</p>
        <p>We received a request to reset the password on your LocalPro account. Click the button below within <strong>${params.expiresMinutes} minutes</strong> to choose a new password:</p>
        <p style="margin: 24px 0;">
          <a href="${safeUrl}" style="display: inline-block; background-color: #1D4ED8; color: #FFFFFF; text-decoration: none; font-weight: 600; padding: 12px 20px; border-radius: 10px;">Reset Password</a>
        </p>
        <p style="font-size: 13px; color: #475569;">If the button doesn&apos;t open directly, paste this single-use token on the login screen:</p>
        <p style="font-family: monospace; font-size: 13px; background: #F1F5F9; padding: 10px 12px; border-radius: 8px; word-break: break-all;">${safeToken}</p>
        <p style="font-size: 12px; color: #64748B; margin-top: 24px;">If you did not request a password reset, you can safely ignore this email. Your password has not been changed.</p>
      </div>
    `,
  });
}

export async function sendEmailChangeVerificationCode(params: {
  toNewEmail: string;
  fullName: string;
  code: string;
  expiresMinutes: number;
}): Promise<EmailSendResult> {
  const safeName = escapeHtml(params.fullName);
  const safeCode = escapeHtml(params.code);

  return sendMail({
    to: params.toNewEmail,
    subject: 'LocalPro — Verify your new email address',
    text: [
      `Hi ${params.fullName},`,
      '',
      'Use this verification code in Account Settings to confirm changing your LocalPro email address:',
      params.code,
      '',
      `This code expires in ${params.expiresMinutes} minutes. Your email will remain unchanged until verification succeeds.`,
      '',
      'If you did not request this change, ignore this message.',
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0F172A; line-height: 1.6;">
        <h2 style="margin: 0 0 12px; color: #0B1F3A;">Verify Your New Email Address</h2>
        <p>Hi ${safeName},</p>
        <p>Enter this 6-digit verification code in LocalPro Account Settings to confirm your new email address:</p>
        <p style="font-family: monospace; font-size: 24px; font-weight: 700; letter-spacing: 4px; background: #F1F5F9; padding: 12px 16px; border-radius: 10px; display: inline-block;">${safeCode}</p>
        <p style="font-size: 13px; color: #475569;">This code expires in ${params.expiresMinutes} minutes. Your existing email stays active until verification succeeds.</p>
      </div>
    `,
  });
}

export async function sendEmailChangeOldEmailNotice(params: {
  toOldEmail: string;
  fullName: string;
  newEmail: string;
}): Promise<EmailSendResult> {
  return sendMail({
    to: params.toOldEmail,
    subject: 'LocalPro Security Notice — Email change requested',
    text: [
      `Hi ${params.fullName},`,
      '',
      `A request was made to change the email address on your LocalPro account to ${params.newEmail}.`,
      'Your current email address remains active until the new address is verified.',
      '',
      'If you did not authorise this request, sign in immediately, change your password, and cancel the pending email change in Account Settings.',
    ].join('\n'),
  });
}

export async function sendAccountVerificationEmail(params: {
  to: string;
  fullName: string;
  verifyUrl: string;
}): Promise<EmailSendResult> {
  const safeName = escapeHtml(params.fullName);
  const safeUrl = escapeHtml(params.verifyUrl);

  return sendMail({
    to: params.to,
    subject: 'LocalPro — Verify your email address',
    text: [
      `Welcome to LocalPro, ${params.fullName}!`,
      '',
      'Please verify your email address by opening this link:',
      params.verifyUrl,
      '',
      'If you did not create a LocalPro account, you can ignore this message.',
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0F172A; line-height: 1.6;">
        <h2 style="margin: 0 0 12px; color: #0B1F3A;">Welcome to LocalPro</h2>
        <p>Hi ${safeName},</p>
        <p>Please confirm your email address by clicking the button below:</p>
        <p style="margin: 24px 0;">
          <a href="${safeUrl}" style="display: inline-block; background-color: #0D9488; color: #FFFFFF; text-decoration: none; font-weight: 600; padding: 12px 20px; border-radius: 10px;">Verify Email Address</a>
        </p>
      </div>
    `,
  });
}
