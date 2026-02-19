function verificationEmailTemplate({ name, verificationUrl }) {
  const subject = 'Verify your Opportunity Pulse account';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #4F46E5;">
    <h1 style="color: #4F46E5; margin: 0; font-size: 24px;">Opportunity Pulse</h1>
  </div>
  <div style="padding: 30px 0;">
    <h2 style="font-size: 20px;">Verify your email address</h2>
    <p>Thanks for signing up${name ? `, ${name}` : ''}! Please verify your email address to get started.</p>
    <div style="text-align: center; padding: 20px 0;">
      <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email</a>
    </div>
    <p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="font-size: 14px; word-break: break-all; color: #4F46E5;">${verificationUrl}</p>
  </div>
  <div style="border-top: 1px solid #eee; padding-top: 15px; font-size: 12px; color: #999; text-align: center;">
    <p>This email was sent by Opportunity Pulse. If you didn't create an account, you can ignore this email.</p>
  </div>
</body>
</html>`;

  const text = `Verify your Opportunity Pulse account\n\nThanks for signing up${name ? `, ${name}` : ''}! Please verify your email by visiting:\n${verificationUrl}\n\nIf you didn't create an account, you can ignore this email.`;

  return { subject, html, text };
}

function resetPasswordEmailTemplate({ resetUrl }) {
  const subject = 'Reset your Opportunity Pulse password';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #4F46E5;">
    <h1 style="color: #4F46E5; margin: 0; font-size: 24px;">Opportunity Pulse</h1>
  </div>
  <div style="padding: 30px 0;">
    <h2 style="font-size: 20px;">Reset your password</h2>
    <p>We received a request to reset your password. Click the button below to choose a new password.</p>
    <div style="text-align: center; padding: 20px 0;">
      <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
    </div>
    <p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="font-size: 14px; word-break: break-all; color: #4F46E5;">${resetUrl}</p>
    <p style="font-size: 14px; color: #666;">This link will expire in 1 hour.</p>
  </div>
  <div style="border-top: 1px solid #eee; padding-top: 15px; font-size: 12px; color: #999; text-align: center;">
    <p>This email was sent by Opportunity Pulse. If you didn't request a password reset, you can safely ignore this email.</p>
  </div>
</body>
</html>`;

  const text = `Reset your Opportunity Pulse password\n\nWe received a request to reset your password. Visit the link below to choose a new password:\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request a password reset, you can safely ignore this email.`;

  return { subject, html, text };
}

module.exports = { verificationEmailTemplate, resetPasswordEmailTemplate };
