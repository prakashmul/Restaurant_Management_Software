import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
  name: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});

// Category names only need to be unique within one restaurant.
categorySchema.index({ restaurantId: 1, name: 1 }, { unique: true });

const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

export default Category;
