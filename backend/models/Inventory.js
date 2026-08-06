import mongoose from 'mongoose';

// The org-wide ingredient catalog — name, unit, and a reference cost shared
// by every location. Actual on-hand quantity lives per-location in Stock;
// this model deliberately has no quantity field.
const inventorySchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true },
    unit: { type: String, required: true }, // e.g., 'kg', 'units', 'liters'
    costPerUnit: { type: Number, required: true },
  },
  { timestamps: true }
);

inventorySchema.index({ restaurantId: 1 });

export default mongoose.model('Inventory', inventorySchema);