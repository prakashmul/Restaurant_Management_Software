import mongoose from 'mongoose';

const recipeItemSchema = new mongoose.Schema({
  inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
  quantityPerPortion: { type: Number, required: true },
});

const menuItemSchema = new mongoose.Schema(
  {
    sku: { type: String },
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    recipe: [recipeItemSchema], // Changed to Array to support multi-ingredient recipes
  },
  { timestamps: true }
);

export default mongoose.model('MenuItem', menuItemSchema);