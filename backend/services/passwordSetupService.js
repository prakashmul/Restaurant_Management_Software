import { generateResetToken } from '../utils/resetToken.js';
import { sendEmail } from './notificationService.js';

const TOKEN_TTL_MS = {
  reset: 60 * 60 * 1000, // 1 hour — the account already works, so a short window is fine
  invite: 24 * 60 * 60 * 1000, // 24 hours — the invitee may not check email right away
};

const COPY = {
  reset: {
    subject: 'Reset your password',
    intro: 'Click the link below to reset your password. This link expires in 1 hour.',
    cta: 'Reset password',
  },
  invite: {
    subject: "You've been invited",
    intro: "You've been added as staff. Click the link below to set your password and get started. This link expires in 24 hours.",
    cta: 'Set your password',
  },
};

// Generates a reset token, persists its hash on the user, and emails the
// set-password link. Shared by forgot-password and staff-invite — an
// invite is just this same token issued for an account nobody has a working
// password for yet, with different subject/intro copy.
export async function issuePasswordSetupEmail({ user, restaurantName, mode }) {
  const { rawToken, tokenHash } = generateResetToken();
  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpires = new Date(Date.now() + TOKEN_TTL_MS[mode]);
  await user.save();

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;
  const { subject, intro, cta } = COPY[mode];

  return sendEmail({
    restaurantName,
    to: user.email,
    subject,
    html: `<p>Hi ${user.name},</p><p>${intro}</p><p><a href="${resetUrl}">${cta}</a></p><p>If this wasn't you, you can safely ignore this email.</p>`,
  });
}
