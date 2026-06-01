const nodemailer = require('nodemailer');
const { env } = require('../config/environment');
const logger = require('../logging/logger');
const { verificationEmailTemplate, resetPasswordEmailTemplate } = require('./emailTemplates');

/**
 * Create a reusable Nodemailer transporter for Gmail SMTP.
 * Returns null if credentials are not configured.
 *
 * Explicitly uses smtp.gmail.com:587 + STARTTLS instead of the
 * `service: 'gmail'` shorthand. Nodemailer's gmail shorthand defaults to
 * port 465 (SSL-on-connect), which Hetzner blocks for outbound traffic.
 * Port 587 is open and is Google's recommended modern path anyway.
 * connectionTimeout caps the dead-port hang at 15s instead of the OS default.
 */
function createTransporter() {
  if (!env.email.user || !env.email.appPassword) {
    return null;
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // upgrade via STARTTLS
    requireTLS: true,
    connectionTimeout: 15000,
    auth: {
      user: env.email.user,
      pass: env.email.appPassword,
    },
  });
}

/**
 * Send a generic email via Gmail SMTP.
 * Gracefully degrades if email credentials are not configured.
 * Accepts optional cc + bcc (string or array). Use cc for visible carbon
 * copies (e.g. team leads on shared digests).
 */
async function sendEmail({ to, subject, html, text, cc, bcc }) {
  const transporter = createTransporter();

  if (!transporter) {
    logger.warn('Email credentials not configured — skipping email send', { to, subject });
    return { sent: false };
  }

  try {
    const payload = {
      from: env.email.from,
      to,
      subject,
      html,
      text,
    };
    if (cc) payload.cc = cc;
    if (bcc) payload.bcc = bcc;
    const info = await transporter.sendMail(payload);

    logger.info('Email sent successfully', {
      to,
      cc: cc || undefined,
      subject,
      messageId: info.messageId,
    });

    return { sent: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Failed to send email', {
      to,
      subject,
      error: error.message,
    });
    return { sent: false, error: error.message };
  }
}

/**
 * Send verification email to a newly registered user.
 */
async function sendVerificationEmail(to, token) {
  const verificationUrl = `${env.email.verificationUrl}?token=${token}`;
  const { subject, html, text } = verificationEmailTemplate({ verificationUrl });
  return sendEmail({ to, subject, html, text });
}

/**
 * Send password reset email to a user.
 */
async function sendPasswordResetEmail(to, token) {
  const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;
  const { subject, html, text } = resetPasswordEmailTemplate({ resetUrl });
  return sendEmail({ to, subject, html, text });
}

module.exports = { sendEmail, sendVerificationEmail, sendPasswordResetEmail };
