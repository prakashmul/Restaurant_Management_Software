import mongoose from 'mongoose';

// Platform-wide — not restaurantId-scoped. Defined and edited entirely from
// the Platform Admin Console's "Plans" tab; a restaurant just points at one
// via Restaurant.planId. `pages` only ever supplies *defaults* — assigning a
// plan to a restaurant unions these into that restaurant's own enabledPages
// rather than replacing it, so a manually-granted extra page never gets
// silently revoked by a plan change (see assignRestaurantPlan).
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    priceMonthly: { type: Number, required: true, min: 0 },
    priceAnnual: { type: Number, required: true, min: 0 },
    // Enterprise-style "+ per location" pricing; 0 for flat-rate plans.
    perLocationPrice: { type: Number, default: 0, min: 0 },
    pages: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Plan', planSchema);
