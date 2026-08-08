import crypto from 'node:crypto';

// Shared by forgot-password and staff-invite (an invite is just a reset
// token for an account nobody has a working password for yet). Only the
// hash is ever persisted — the raw token exists just long enough to go into
// the emailed link, so a database read alone can never produce a valid one.
export function generateResetToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

export function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
