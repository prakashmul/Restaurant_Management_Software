import mongoose from 'mongoose';

const transferItemSchema = new mongoose.Schema(
  {
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
    itemName: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

// A stock movement between two Locations of the same Restaurant. Creating a
// transfer immediately debits the source location's Stock (status
// "in_transit") — the same atomic, insufficient-stock-rejecting pattern as
// an order deducting recipe ingredients. Marking it "received" credits the
// destination location's Stock. A still-"in_transit" transfer can be
// cancelled, which refunds the source.
const transferSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    fromLocationName: { type: String, required: true },
    toLocationName: { type: String, required: true },
    items: { type: [transferItemSchema], validate: (v) => Array.isArray(v) && v.length > 0 },
    status: { type: String, enum: ['in_transit', 'received', 'cancelled'], default: 'in_transit' },
    requestedBy: { type: String, default: '' },
    receivedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

transferSchema.index({ restaurantId: 1, fromLocationId: 1, status: 1 });
transferSchema.index({ restaurantId: 1, toLocationId: 1, status: 1 });

export default mongoose.model('Transfer', transferSchema);
