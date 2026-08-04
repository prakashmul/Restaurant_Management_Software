import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// A given phone number identifies one customer. Blank phones are common for
// walk-in credit customers, so they're excluded from the uniqueness
// constraint instead of forcing every walk-in into a single record.
customerSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $gt: '' } } });

export default mongoose.model('Customer', customerSchema);
