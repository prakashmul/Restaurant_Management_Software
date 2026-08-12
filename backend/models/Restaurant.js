import mongoose from 'mongoose';

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    currency: { type: String, default: 'Rs.' },
    taxRatePercent: { type: Number, default: 8 },
    // Loyalty points are never stored as a running balance — they're
    // recomputed from lifetime spend on every read (see customersController.js),
    // so changing this rate only affects points earned going forward, never
    // rewrites history. Default: 1 point per Rs. 100 spent, each point worth Rs. 1.
    loyaltyEarnRatePerRs: { type: Number, default: 0.01, min: 0 },
    loyaltyPointValueRs: { type: Number, default: 1, min: 0 },
    geofence: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      radiusMeters: { type: Number, default: 300 },
    },
    // Platform-admin-controlled entitlement list (page.* keys, same values
    // as permissions.js's "Page Access" section). Empty by default for every
    // new signup. Not yet enforced anywhere — see the platform admin console
    // — this is the data model for a later phase that will gate Sidebar/
    // PageGuard/routes by it, on top of the existing per-role permissions.
    enabledPages: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Restaurant', restaurantSchema);
