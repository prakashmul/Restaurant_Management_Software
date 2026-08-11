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
    // This location's own weighted-average cost for the ingredient — moves
    // toward whatever price a new priced receipt (PO or manual restock) came
    // in at, weighted by how much was already on hand here. null = this
    // location has never received a priced batch of this ingredient yet;
    // callers fall back to Inventory.costPerUnit in that case. Quantity-only
    // movements (sales, waste, refunds, unpriced restocks) never touch this.
    costPerUnit: { type: Number, default: null },
  },
  { timestamps: true }
);

stockSchema.index({ restaurantId: 1, locationId: 1, inventoryItemId: 1 }, { unique: true });

export default mongoose.model('Stock', stockSchema);
