import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  menuItemId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 1 },
  // Optional snapshot of recipe used at time of order for inventory tracking
  recipe: [
    {
      inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
      quantityPerPortion: { type: Number, required: true }
    }
  ]
});

const paymentLogSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  note: { type: String, default: '' },
  type: { type: String, enum: ['partial', 'full'], default: 'partial' },
  createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
    items: [orderItemSchema],
    status: {
      type: String,
      enum: ['pending', 'paid', 'credit', 'unsettled', 'settled', 'cancelled'],
      default: 'pending'
    },
    paymentMethod: { type: String, default: 'cash' },
    // customerId is the source of truth for grouping credit orders by
    // customer; customerName/customerPhone remain as a denormalized
    // snapshot for display (receipts, order history) so nothing downstream
    // has to join against Customer just to render a name.
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
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

// Enforces "one pending order per table" at the database level, so two
// concurrent save-order requests for the same table can't both succeed —
// one will hit a duplicate-key error, which the route handler retries as an update.
orderSchema.index(
  { restaurantId: 1, tableId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

// The credit ledger groups by customerId when available, falling back to
// these for orders that predate the Customer migration (see server.js).
orderSchema.index({ restaurantId: 1, locationId: 1, customerId: 1 });
orderSchema.index({ restaurantId: 1, locationId: 1, customerPhone: 1 });
orderSchema.index({ restaurantId: 1, locationId: 1, customerName: 1 });

export default mongoose.model('Order', orderSchema);