import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

// A User is just a login identity (name, email, password) — which
// restaurant(s) they can access and what role they hold at each is tracked
// separately in StaffMembership, since one person can work at more than one.
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  createdAt: { type: Date, default: Date.now },
  // Set as soon as /2fa/setup is called, but totpEnabled stays false until
  // the user proves possession of the authenticator app via /2fa/enable —
  // so a setup that's started and abandoned never actually gates login.
  totpSecret: { type: String, default: null, select: false },
  totpEnabled: { type: Boolean, default: false },
  // Shared by forgot-password and staff-invite ("set your password" is just
  // a reset token for an account with a password nobody knows yet). Only
  // the SHA-256 hash is stored, never the raw token that goes in the email.
  passwordResetTokenHash: { type: String, default: null, select: false },
  passwordResetExpires: { type: Date, default: null, select: false },
});

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;