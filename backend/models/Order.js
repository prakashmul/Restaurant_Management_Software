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
  ],
  // Kitchen Display System — whether this line has been prepared. Per-item
  // (not per-order) so a ticket with multiple courses can show partial
  // progress instead of only flipping when everything is done at once.
  bumped: { type: Boolean, default: false },
});

const paymentLogSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  note: { type: String, default: '' },
  type: { type: String, enum: ['partial', 'full'], default: 'partial' },
  createdAt: { type: Date, default: Date.now }
});

// No real payment gateway exists (see refundOrder in ordersController.js) —
// this is an internal ledger reversal only, kept as its own history array
// (rather than reusing paymentHistory) so a refund is never mistaken for a
// payment when a receipt or ledger view iterates one or the other.
const refundLogSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  reason: { type: String, required: true },
  refundedBy: { type: String, default: '' },
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
      enum: ['pending', 'paid', 'credit', 'unsettled', 'settled', 'cancelled', 'refunded'],
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
    // Applied to the subtotal before tax. type: null means no discount.
    // amount is the actual Rs. deducted — a snapshot computed at apply time
    // so a later change to costPerUnit-style inputs never retroactively
    // changes what a past order's discount was worth.
    discount: {
      type: { type: String, enum: ['percent', 'flat'], default: null },
      value: { type: Number, default: 0 },
      reason: { type: String, default: '' },
      amount: { type: Number, default: 0 },
    },
    // Added post-tax, not itself taxed — mirrors the discount subdocument's
    // snapshot-at-apply-time convention.
    tip: {
      type: { type: String, enum: ['percent', 'flat'], default: null },
      value: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    remainingBalance: { type: Number, default: 0 },
    paymentHistory: [paymentLogSchema],
    refundHistory: [refundLogSchema],
    refundedAt: { type: Date, default: null },
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