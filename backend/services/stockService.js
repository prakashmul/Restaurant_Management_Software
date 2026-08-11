import mongoose from 'mongoose';
import MenuItem from '../models/MenuItem.js';
import Inventory from '../models/Inventory.js';
import Stock from '../models/Stock.js';
import StockHistory from '../models/StockHistory.js';

// Deducts recipe ingredients for every item in the order. Must run inside
// the caller's transaction session. Stock levels are informational — a
// low-stock reminder, not a gate — so this always deducts and lets an order
// go through even if it takes an ingredient negative; staff can substitute
// in practice, and a negative count just flags that the tracked number is
// now behind reality until the next restock/count. Deducts from the order's
// own location's Stock pool — an order can only ever consume the stock
// physically present at the location it was placed at.
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

      // Atomic decrement — always succeeds (upserts the Stock doc if it
      // doesn't exist yet), so concurrent orders still sum correctly and
      // nothing ever blocks on the current quantity.
      await Stock.findOneAndUpdate(
        { restaurantId, locationId, inventoryItemId: invItem._id },
        { $inc: { totalQuantity: -totalDeduction } },
        { upsert: true, session }
      );

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

// Blends a newly-received quantity's price into a location's existing
// weighted-average cost (moving-average inventory costing) — the same
// arithmetic whether the receipt came from a Purchase Order or a manual
// restock. Must run inside the caller's transaction session, and quantity
// must be positive (this is for receiving stock, not adjusting it). Only
// ever called with a real unitCost — a genuine priced purchase; quantity-only
// movements (sales, waste, refunds, unpriced restocks, transfers) must keep
// using a plain $inc on Stock instead of this, since blending a price into
// them makes no sense.
//
// e.g. 1.2kg on hand @ Rs.100/kg, receiving 4kg @ Rs.110/kg:
// (1.2 * 100 + 4 * 110) / (1.2 + 4) = Rs.107.69/kg
export async function receiveStockAtCost({ restaurantId, locationId, inventoryItemId, quantity, unitCost, fallbackCost, session }) {
  const existing = await Stock.findOne({ restaurantId, locationId, inventoryItemId }).session(session);
  // A location can theoretically show negative stock (see deductStockForOrder
  // above) if consumption ran ahead of what was ever recorded as received —
  // that negative quantity has no real cost basis to weight against, so a
  // new priced receipt simply becomes the fresh average rather than being
  // dragged down by it.
  const priorQty = Math.max(0, existing?.totalQuantity || 0);
  const priorCost = existing?.costPerUnit ?? fallbackCost ?? unitCost;
  const newCost = (priorQty * priorCost + quantity * unitCost) / (priorQty + quantity);

  return Stock.findOneAndUpdate(
    { restaurantId, locationId, inventoryItemId },
    { $inc: { totalQuantity: quantity }, $set: { costPerUnit: newCost } },
    { new: true, upsert: true, session }
  );
}
