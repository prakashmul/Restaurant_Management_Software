import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

// Deliberately separate from User/StaffMembership — a platform admin is the
// project owner's own console login, not a member of any restaurant. Never
// carries a restaurantId or locationId. The very first record is seeded at
// boot from PLATFORM_ADMIN_EMAIL/PASSWORD (see platformAdminSeedService.js);
// every one after that is created via the in-console invite flow.
const platformAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    // Who invited this admin — null for the original env-seeded account.
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAdmin', default: null },
    // Set once by the seed service, then never true again for anyone else —
    // distinguishes the one account env vars can reseed from invited ones.
    isSeedAccount: { type: Boolean, default: false },
    // Shared shape with User.js's invite/reset fields. An invited admin has
    // no usable password until they set one via this token.
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true }
);

platformAdminSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

platformAdminSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

const PlatformAdmin = mongoose.models.PlatformAdmin || mongoose.model('PlatformAdmin', platformAdminSchema);

export default PlatformAdmin;
