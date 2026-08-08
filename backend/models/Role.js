import mongoose from 'mongoose';

// A named set of permissions, scoped to one restaurant. The 5 built-in roles
// (Owner, Manager, Cashier, Waiter, Kitchen) are seeded for every restaurant
// at creation time and can be freely edited — except "Owner", which is
// reserved: it always holds every permission and can't be renamed, edited,
// or deleted (see rolesController). Anything else is a "custom role".
const roleSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    permissions: { type: [String], default: [] },
  },
  { timestamps: true }
);

roleSchema.index({ restaurantId: 1, name: 1 }, { unique: true });

export default mongoose.model('Role', roleSchema);
