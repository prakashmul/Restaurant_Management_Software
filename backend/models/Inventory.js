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
    // 0 = no alert configured. Compared against a location's own Stock
    // quantity, not anything stored here — see attachStockQuantities.
    lowStockThreshold: { type: Number, default: 0, min: 0 },
    // Both optional — only items with a vendor AND a target quantity show up
    // in the auto-drafted purchase order suggestions (see getSuggestedOrders).
    preferredVendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    reorderQuantity: { type: Number, default: 0, min: 0 },
    // Scanned during PO receiving to find the matching item without typing
    // its name — see the barcode-scan flow in ProcurementPage. Not unique:
    // if two items share a code, the scanner just matches the first.
    barcode: { type: String, default: null },
  },
  { timestamps: true }
);

inventorySchema.index({ restaurantId: 1 });
inventorySchema.index({ restaurantId: 1, barcode: 1 });

export default mongoose.model('Inventory', inventorySchema);