import mongoose from 'mongoose';

const poItemSchema = new mongoose.Schema(
  {
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
    itemName: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true },
  },
  { _id: false }
);

// Status only ever moves forward: draft -> sent -> received -> reconciled.
// Stock is actually added to Inventory the moment a PO transitions to
// "received" (see procurementController.updateStatus) — the same event a
// manual restock represents, just sourced from a vendor instead of a
// free-text note.
const purchaseOrderSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    vendorName: { type: String, required: true },
    status: { type: String, enum: ['draft', 'sent', 'received', 'reconciled'], default: 'draft' },
    items: [poItemSchema],
    totalAmount: { type: Number, required: true },
    createdBy: { type: String, default: '' },
    sentAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    reconciledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ restaurantId: 1, locationId: 1, status: 1 });
purchaseOrderSchema.index({ restaurantId: 1, vendorId: 1 });

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);
