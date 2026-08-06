import mongoose from 'mongoose';

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    currency: { type: String, default: 'Rs.' },
    taxRatePercent: { type: Number, default: 8 },
    geofence: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      radiusMeters: { type: Number, default: 300 },
    },
  },
  { timestamps: true }
);

export default mongoose.model('Restaurant', restaurantSchema);
