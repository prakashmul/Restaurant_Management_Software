import mongoose from 'mongoose';

// One model covers both booked reservations and walk-in waitlist entries —
// they're the same "party waiting for a table" concept, just with
// `reservationTime` set or not. Keeping them in one collection means one
// combined view can show "who's arriving next" regardless of which queue
// they came from.
const reservationSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    type: { type: String, enum: ['reservation', 'waitlist'], required: true },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, trim: true, default: '' },
    partySize: { type: Number, required: true, min: 1 },
    // Only set for type: 'reservation' — a waitlist entry has no booked time,
    // it's ordered by when it was added (createdAt) instead.
    reservationTime: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'waiting', 'seated', 'cancelled', 'no-show'],
      default: 'pending',
    },
    // Reference only — seating a party here doesn't touch Table.status or
    // create an order; staff still do that themselves at the POS once the
    // party is actually seated, exactly like today.
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

reservationSchema.index({ restaurantId: 1, locationId: 1, status: 1, reservationTime: 1 });

export default mongoose.model('Reservation', reservationSchema);
