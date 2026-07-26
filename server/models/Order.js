import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  menuItemId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 1 },
});

const paymentLogSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  note: { type: String, default: '' },
  type: { type: String, enum: ['partial', 'full'], default: 'partial' },
  createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema(
  {
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
    items: [orderItemSchema],
    status: { type: String, enum: ['pending', 'paid', 'credit', 'unsettled', 'settled', 'cancelled'], default: 'pending' },
    paymentMethod: { type: String, default: 'cash' },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    remainingBalance: { type: Number, default: 0 },
    paymentHistory: [paymentLogSchema],
    notes: { type: String, default: '' },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('Order', orderSchema);