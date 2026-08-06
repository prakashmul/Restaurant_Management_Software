import mongoose from 'mongoose';

// Per-location on-hand quantity for an org-wide Inventory (ingredient
// catalog) item. One restaurant's ingredient can have a different Stock
// document — and therefore a different quantity — at every Location.
const stockSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
    totalQuantity: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

stockSchema.index({ restaurantId: 1, locationId: 1, inventoryItemId: 1 }, { unique: true });

export default mongoose.model('Stock', stockSchema);
