const nodemailer = require('nodemailer');
const { env } = require('../config/environment');
const logger = require('../logging/logger');
const { verificationEmailTemplate, resetPasswordEmailTemplate } = require('./emailTemplates');

/**
 * Create a reusable Nodemailer transporter for Gmail SMTP.
 * Returns null if credentials are not configured.
 */
function createTransporter() {
  if (!env.email.user || !env.email.appPassword) {
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.email.user,
      pass: env.email.appPassword,
    },
  });
}

/**
 * Send a generic email via Gmail SMTP.
 * Gracefully degrades if email credentials are not configured.
 */
async function sendEmail({ to, subject, html, text }) {
  const transporter = createTransporter();

  if (!transporter) {
    logger.warn('Email credentials not configured — skipping email send', { to, subject });
    return { sent: false };
  }

  try {
    const info = await transporter.sendMail({
      from: env.email.from,
      to,
      subject,
      html,
      text,
    });

    logger.info('Email sent successfully', {
      to,
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
