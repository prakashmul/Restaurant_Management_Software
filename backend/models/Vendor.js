import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    contactPhone: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
  },
  { timestamps: true }
);

vendorSchema.index({ restaurantId: 1 });

export default mongoose.model('Vendor', vendorSchema);
