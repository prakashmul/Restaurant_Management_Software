import mongoose from 'mongoose';

// Decouples identity (User: email/password, a global login) from access
// (which restaurant, and what role there) — the same person can hold
// separate memberships, with separate roles, at more than one restaurant.
const staffMembershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    // null = unrestricted (sees/acts across every location — how Owners and
    // most Managers work); set = confined to that one location.
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },
    // Denormalized display name, kept in sync with roleId's Role.name
    // whenever it changes — cheap to read (JWT carries it, no join needed
    // for display), but never authoritative for access control. Not a
    // fixed enum any more since custom roles can be named anything.
    role: { type: String, required: true, trim: true },
    // Source of truth for permission checks — see middleware/auth.js's
    // requirePermission, which always re-reads Role.permissions fresh
    // rather than trusting anything baked into the JWT.
    roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
    status: { type: String, enum: ['active', 'invited'], default: 'active' },
    // Used only by payroll export — matched against Attendance.employeeName
    // (free text, not a ref) by display name, same convention the dashboard
    // already uses to filter a staff member's own attendance history.
    hourlyRate: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

staffMembershipSchema.index({ userId: 1, restaurantId: 1 }, { unique: true });
staffMembershipSchema.index({ restaurantId: 1 });

export default mongoose.model('StaffMembership', staffMembershipSchema);
