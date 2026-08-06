import mongoose from 'mongoose';

const tableSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    number: { type: Number, required: true },
    seats: { type: Number, default: 4 },
    status: { type: String, enum: ['available', 'occupied'], default: 'available' },
  },
  { timestamps: true }
);

// Table numbers only need to be unique within one location, not restaurant-wide.
tableSchema.index({ restaurantId: 1, locationId: 1, number: 1 }, { unique: true });

export default mongoose.model('Table', tableSchema);