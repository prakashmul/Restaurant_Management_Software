import mongoose from 'mongoose';
import MenuItem from '../models/MenuItem.js';
import Inventory from '../models/Inventory.js';
import Stock from '../models/Stock.js';
import StockHistory from '../models/StockHistory.js';

// Deducts recipe ingredients for every item in the order. Must run inside
// the caller's transaction session. Throws (aborting the transaction) if
// any ingredient doesn't have enough stock, instead of silently clamping to
// zero the way the original implementation did. Deducts from the order's own
// location's Stock pool — an order can only ever consume the stock physically
// present at the location it was placed at.
export async function deductStockForOrder(order, performedByTag, session) {
  const restaurantId = order.restaurantId;
  const locationId = order.locationId;

  const menuItemIds = [...new Set(order.items.map((i) => i.menuItemId))].filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  const menuItems = await MenuItem.find({ _id: { $in: menuItemIds }, restaurantId }).session(session);
  const menuItemById = new Map(menuItems.map((m) => [m._id.toString(), m]));

  const ingredientIds = [
    ...new Set(
      menuItems.flatMap((m) => (Array.isArray(m.recipe) ? m.recipe.map((r) => r.inventoryItemId?.toString()) : []))
    ),
  ].filter(Boolean);
  const inventoryItems = await Inventory.find({ _id: { $in: ingredientIds }, restaurantId }).session(session);
  const inventoryById = new Map(inventoryItems.map((i) => [i._id.toString(), i]));

  for (const orderItem of order.items) {
    const menuItem = menuItemById.get(orderItem.menuItemId);
    if (!menuItem || !Array.isArray(menuItem.recipe)) continue;

    for (const recipeIngredient of menuItem.recipe) {
      if (!recipeIngredient.inventoryItemId) continue;

      const invItem = inventoryById.get(recipeIngredient.inventoryItemId.toString());
      if (!invItem) continue; // ingredient was deleted from the catalog since the recipe was saved

      const totalDeduction = recipeIngredient.quantityPerPortion * orderItem.quantity;

      // Atomic conditional decrement — only succeeds if enough stock exists right now,
      // so two simultaneous payments can never both deduct from the same units.
      const updatedStock = await Stock.findOneAndUpdate(
        {
          restaurantId,
          locationId,
          inventoryItemId: invItem._id,
          totalQuantity: { $gte: totalDeduction },
        },
        { $inc: { totalQuantity: -totalDeduction } },
        { returnDocument: 'after', session }
      );

      if (!updatedStock) {
        throw Object.assign(new Error(`Not enough stock of "${invItem.name}" to complete this order.`), {
          status: 409,
        });
      }

      await StockHistory.create(
        [
          {
            restaurantId,
            locationId,
            itemId: invItem._id,
            itemName: invItem.name,
            quantity: -totalDeduction,
            unit: invItem.unit,
            performedBy: performedByTag,
            description: `Auto-deducted for Order #${order._id.toString().slice(-4)}`,
          },
        ],
        { session }
      );
    }
  }
}

// Reverses deductStockForOrder — adds each recipe ingredient's quantity
// back to the order's location. Used by refundOrder in ordersController.js.
// Recipes are re-read fresh (not stored on the order at deduction time), so
// an ingredient removed from a menu item's recipe after the order was
// placed is simply skipped here too, matching what deduction actually did.
export async function restoreStockForOrder(order, performedByTag, session) {
  const restaurantId = order.restaurantId;
  const locationId = order.locationId;

  const menuItemIds = [...new Set(order.items.map((i) => i.menuItemId))].filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  const menuItems = await MenuItem.find({ _id: { $in: menuItemIds }, restaurantId }).session(session);
  const menuItemById = new Map(menuItems.map((m) => [m._id.toString(), m]));

  const ingredientIds = [
    ...new Set(
      menuItems.flatMap((m) => (Array.isArray(m.recipe) ? m.recipe.map((r) => r.inventoryItemId?.toString()) : []))
    ),
  ].filter(Boolean);
  const inventoryItems = await Inventory.find({ _id: { $in: ingredientIds }, restaurantId }).session(session);
  const inventoryById = new Map(inventoryItems.map((i) => [i._id.toString(), i]));

  for (const orderItem of order.items) {
    const menuItem = menuItemById.get(orderItem.menuItemId);
    if (!menuItem || !Array.isArray(menuItem.recipe)) continue;

    for (const recipeIngredient of menuItem.recipe) {
      if (!recipeIngredient.inventoryItemId) continue;

      const invItem = inventoryById.get(recipeIngredient.inventoryItemId.toString());
      if (!invItem) continue;

      const totalRestore = recipeIngredient.quantityPerPortion * orderItem.quantity;

      await Stock.findOneAndUpdate(
        { restaurantId, locationId, inventoryItemId: invItem._id },
        { $inc: { totalQuantity: totalRestore } },
        { session }
      );

      await StockHistory.create(
        [
          {
            restaurantId,
            locationId,
            itemId: invItem._id,
            itemName: invItem.name,
            quantity: totalRestore,
            unit: invItem.unit,
            performedBy: performedByTag,
            description: `Restored from refund of Order #${order._id.toString().slice(-4)}`,
          },
        ],
        { session }
      );
    }
  }
}
