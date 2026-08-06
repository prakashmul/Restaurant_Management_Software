import mongoose from 'mongoose';

// A physical branch within a Restaurant (organization). Address/phone/
// geofence used to live directly on Restaurant — they moved here so a
// multi-location organization can have a different one per branch. A
// single-location restaurant just has exactly one of these.
const locationSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    geofence: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      radiusMeters: { type: Number, default: 300 },
    },
  },
  { timestamps: true }
);

locationSchema.index({ restaurantId: 1 });

export default mongoose.model('Location', locationSchema);
