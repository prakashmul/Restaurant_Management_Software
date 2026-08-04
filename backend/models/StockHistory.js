import mongoose from 'mongoose';

const stockHistorySchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'units' },
  performedBy: { type: String, default: 'Anonymous' },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

stockHistorySchema.index({ createdAt: -1 });

const StockHistory = mongoose.models.StockHistory || mongoose.model('StockHistory', stockHistorySchema);

export default StockHistory;
