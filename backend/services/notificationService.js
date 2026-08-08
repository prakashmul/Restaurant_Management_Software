import { Resend } from 'resend';
import { logger } from '../middleware/logger.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';

// Only ever populated in the test suite (see the NODE_ENV branch below) —
// lets tests assert what would have been sent without a real network call.
export const testSentEmails = [];

// Sends mail "from" a given restaurant's display name, routed through the
// platform's one verified sender — recipients see the restaurant's name and
// replies go to replyTo, even though the underlying sending domain is shared
// across every tenant until each one verifies their own. Never throws: a
// failed send is logged and reported back via the return value so callers
// (e.g. staff invite) can decide whether it's fatal to their own flow rather
// than having an email hiccup take down an unrelated database write.
export async function sendEmail({ restaurantName, to, replyTo, subject, html }) {
  // Never hit the real provider from the test suite — same convention as
  // authRoutes.js's rate limiter branching on NODE_ENV for test-only behavior.
  if (process.env.NODE_ENV === 'test') {
    testSentEmails.push({ restaurantName, to, replyTo, subject, html });
    return { sent: true, skipped: true };
  }

  if (!resend) {
    logger.warn({ to, subject }, 'RESEND_API_KEY not set — skipping email send');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const { error } = await resend.emails.send({
      from: `${restaurantName} <${FROM_ADDRESS}>`,
      to,
      replyTo,
      subject,
      html,
    });
    if (error) {
      logger.error({ error, to, subject }, 'Resend rejected the email');
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send email');
    return { sent: false, reason: 'exception' };
  }
}
