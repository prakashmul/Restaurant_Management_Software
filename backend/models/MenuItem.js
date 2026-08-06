import mongoose from 'mongoose';

const recipeItemSchema = new mongoose.Schema({
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
  quantityPerPortion: { type: Number, required: true },
});

const menuItemSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true },
    sku: { type: String },
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    recipe: [recipeItemSchema], // Changed to Array to support multi-ingredient recipes
  },
  { timestamps: true }
);

menuItemSchema.index({ restaurantId: 1 });

export default mongoose.model('MenuItem', menuItemSchema);