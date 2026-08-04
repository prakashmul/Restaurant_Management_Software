import mongoose from 'mongoose';
import MenuItem from '../models/MenuItem.js';
import Inventory from '../models/Inventory.js';
import StockHistory from '../models/StockHistory.js';

// Deducts recipe ingredients for every item in the order. Must run inside
// the caller's transaction session. Throws (aborting the transaction) if
// any ingredient doesn't have enough stock, instead of silently clamping to
// zero the way the original implementation did.
export async function deductStockForOrder(order, performedByTag, session) {
  const menuItemIds = [...new Set(order.items.map((i) => i.menuItemId))].filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  const menuItems = await MenuItem.find({ _id: { $in: menuItemIds } }).session(session);
  const menuItemById = new Map(menuItems.map((m) => [m._id.toString(), m]));

  for (const orderItem of order.items) {
    const menuItem = menuItemById.get(orderItem.menuItemId);
    if (!menuItem || !Array.isArray(menuItem.recipe)) continue;

    for (const recipeIngredient of menuItem.recipe) {
      if (!recipeIngredient.inventoryItemId) continue;

      const totalDeduction = recipeIngredient.quantityPerPortion * orderItem.quantity;

      // Atomic conditional decrement — only succeeds if enough stock exists right now,
      // so two simultaneous payments can never both deduct from the same units.
      const updatedInv = await Inventory.findOneAndUpdate(
        { _id: recipeIngredient.inventoryItemId, totalQuantity: { $gte: totalDeduction } },
        { $inc: { totalQuantity: -totalDeduction } },
        { returnDocument: 'after', session }
      );

      if (!updatedInv) {
        const invDoc = await Inventory.findById(recipeIngredient.inventoryItemId).session(session);
        throw Object.assign(
          new Error(`Not enough stock of "${invDoc?.name || 'an ingredient'}" to complete this order.`),
          { status: 409 }
        );
      }

      await StockHistory.create(
        [
          {
            itemId: updatedInv._id,
            itemName: updatedInv.name,
            quantity: -totalDeduction,
            unit: updatedInv.unit,
            performedBy: performedByTag,
            description: `Auto-deducted for Order #${order._id.toString().slice(-4)}`,
          },
        ],
        { session }
      );
    }
  }
}
