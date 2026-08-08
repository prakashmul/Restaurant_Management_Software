import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    // Cumulative points ever redeemed — never decreases. Points *earned* are
    // deliberately not stored here; they're derived live from lifetime spend
    // (see customersController.js) so they can never drift from order history.
    pointsRedeemed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// A given phone number identifies one customer within one location — the
// same phone number can be a different customer at a different location.
// Blank phones are common for walk-in credit customers, so they're excluded
// from the uniqueness constraint instead of forcing every walk-in into one record.
customerSchema.index(
  { restaurantId: 1, locationId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $gt: '' } } }
);

export default mongoose.model('Customer', customerSchema);
