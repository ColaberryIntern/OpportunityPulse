const sgMail = require('@sendgrid/mail');
const { env } = require('../config/environment');
const logger = require('../logging/logger');
const { verificationEmailTemplate } = require('./emailTemplates');

/**
 * Send a generic email via SendGrid.
 * Gracefully degrades if EMAIL_API_KEY is not configured.
 */
async function sendEmail({ to, subject, html, text }) {
  if (!env.email.apiKey) {
    logger.warn('EMAIL_API_KEY not configured — skipping email send', { to, subject });
    return { sent: false };
  }

  sgMail.setApiKey(env.email.apiKey);

  try {
    const [response] = await sgMail.send({
      to,
      from: env.email.from,
      subject,
      html,
      text,
    });

    logger.info('Email sent successfully', {
      to,
      subject,
      statusCode: response.statusCode,
    });

    return { sent: true, statusCode: response.statusCode };
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

module.exports = { sendEmail, sendVerificationEmail };
