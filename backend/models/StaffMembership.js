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
    role: {
      type: String,
      enum: ['Owner', 'Manager', 'Cashier', 'Waiter', 'Kitchen'],
      required: true,
    },
    status: { type: String, enum: ['active', 'invited'], default: 'active' },
  },
  { timestamps: true }
);

staffMembershipSchema.index({ userId: 1, restaurantId: 1 }, { unique: true });
staffMembershipSchema.index({ restaurantId: 1 });

export default mongoose.model('StaffMembership', staffMembershipSchema);
