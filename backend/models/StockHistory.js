import mongoose from 'mongoose';

const stockHistorySchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'units' },
  performedBy: { type: String, default: 'Anonymous' },
  description: { type: String, default: '' },
  // Only set for deliberate waste log entries (see logWaste) — null for
  // ordinary restocks, order-driven deductions, and transfers.
  wasteReason: { type: String, enum: ['spoilage', 'breakage', 'staff-meal', 'other', null], default: null },
  createdAt: { type: Date, default: Date.now },
});

stockHistorySchema.index({ restaurantId: 1, locationId: 1, createdAt: -1 });

const StockHistory = mongoose.models.StockHistory || mongoose.model('StockHistory', stockHistorySchema);

export default StockHistory;
