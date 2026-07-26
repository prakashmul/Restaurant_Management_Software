import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    totalQuantity: { type: Number, required: true, default: 0 },
    unit: { type: String, required: true }, // e.g., 'kg', 'units', 'liters'
    costPerUnit: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Inventory', inventorySchema);