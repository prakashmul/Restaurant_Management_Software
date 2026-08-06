import MenuItem from '../models/MenuItem.js';
import Inventory from '../models/Inventory.js';
import Order from '../models/Order.js';
import StockHistory from '../models/StockHistory.js';

const SOLD_STATUSES = ['paid', 'credit', 'unsettled', 'settled'];
const MANUAL_DEDUCTION_PATTERN = /^Auto-deducted for Order #/;

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Ingredient cost is computed live from the menu item's current recipe and
// each ingredient's current Inventory.costPerUnit — this is "what this dish
// costs to make right now", not a historical snapshot. A dish whose recipe
// references a deleted inventory item can't be fully costed, so it's
// reported with ingredientCost: null rather than an understated number.
function computeIngredientCost(menuItem, inventoryCostById) {
  if (!Array.isArray(menuItem.recipe) || menuItem.recipe.length === 0) return null;

  let cost = 0;
  for (const ingredient of menuItem.recipe) {
    const costPerUnit = inventoryCostById.get(ingredient.inventoryItemId?.toString());
    if (costPerUnit === undefined) return null;
    cost += ingredient.quantityPerPortion * costPerUnit;
  }
  return cost;
}

export async function getMenuEngineering(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // MenuItem/Inventory are shared across every location (one menu, one
    // stock catalog); units sold — and therefore popularity — is scoped to
    // whichever location is currently selected, or every location if none is.
    const orderQuery = { restaurantId, status: { $in: SOLD_STATUSES }, createdAt: { $gte: since } };
    if (locationId) orderQuery.locationId = locationId;

    const wasteQuery = { restaurantId, quantity: { $lt: 0 }, createdAt: { $gte: since } };
    if (locationId) wasteQuery.locationId = locationId;

    const [menuItems, inventoryItems, soldOrders, wasteLog] = await Promise.all([
      MenuItem.find({ restaurantId }),
      Inventory.find({ restaurantId }),
      Order.find(orderQuery, 'items'),
      StockHistory.find(wasteQuery).sort({ createdAt: -1 }).limit(20),
    ]);

    const inventoryCostById = new Map(inventoryItems.map((i) => [i._id.toString(), i.costPerUnit]));

    const unitsSoldById = new Map();
    for (const order of soldOrders) {
      for (const item of order.items) {
        const key = String(item.menuItemId);
        unitsSoldById.set(key, (unitsSoldById.get(key) || 0) + item.quantity);
      }
    }

    const dishes = menuItems.map((menuItem) => {
      const ingredientCost = computeIngredientCost(menuItem, inventoryCostById);
      const unitsSold = unitsSoldById.get(menuItem._id.toString()) || 0;
      const foodCostPercent = ingredientCost !== null && menuItem.price > 0 ? (ingredientCost / menuItem.price) * 100 : null;
      const margin = ingredientCost !== null ? menuItem.price - ingredientCost : null;

      return {
        id: menuItem._id,
        name: menuItem.name,
        category: menuItem.category,
        price: menuItem.price,
        ingredientCost,
        foodCostPercent,
        margin,
        unitsSold,
        revenue: menuItem.price * unitsSold,
        classification: null, // filled in below once medians are known
      };
    });

    const costedDishes = dishes.filter((d) => d.ingredientCost !== null);
    const medianUnitsSold = median(costedDishes.map((d) => d.unitsSold));
    const medianMargin = median(costedDishes.map((d) => d.margin));

    if (costedDishes.length >= 2) {
      for (const dish of costedDishes) {
        const highPopularity = dish.unitsSold >= medianUnitsSold;
        const highMargin = dish.margin >= medianMargin;
        dish.classification = highPopularity && highMargin
          ? 'star'
          : !highPopularity && highMargin
          ? 'puzzle'
          : highPopularity && !highMargin
          ? 'plow-horse'
          : 'dog';
      }
    }

    dishes.sort((a, b) => b.unitsSold - a.unitsSold);

    res.json({
      periodDays: days,
      medianUnitsSold,
      medianMargin,
      dishesAnalyzed: costedDishes.length,
      dishesMissingCostData: dishes.length - costedDishes.length,
      dishes,
      wasteLog: wasteLog.map((entry) => ({
        id: entry._id,
        itemName: entry.itemName,
        quantity: entry.quantity,
        unit: entry.unit,
        reason: entry.description,
        performedBy: entry.performedBy,
        createdAt: entry.createdAt,
        isManual: !MANUAL_DEDUCTION_PATTERN.test(entry.description || ''),
      })).filter((entry) => entry.isManual),
    });
  } catch (err) {
    req.log.error({ err }, 'Error computing menu engineering report');
    res.status(500).json({ error: 'Failed to compute recipe costing report' });
  }
}
