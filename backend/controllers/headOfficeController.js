import Location from '../models/Location.js';
import MenuItem from '../models/MenuItem.js';
import Inventory from '../models/Inventory.js';
import Order from '../models/Order.js';
import Attendance from '../models/Attendance.js';

const SOLD_STATUSES = ['paid', 'credit', 'unsettled', 'settled'];
const OUTSTANDING_STATUSES = ['credit', 'unsettled'];

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

function durationToSeconds(duration) {
  if (!duration) return 0;
  const [h = 0, m = 0, s = 0] = duration.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

function statusFromFoodCost(percent) {
  if (percent === null) return 'unknown';
  if (percent <= 30) return 'good';
  if (percent <= 38) return 'watch';
  return 'bad';
}

// Cross-location rollup for the Owner: today's sales/food-cost/credit per
// location, a 7-day sales trend, and a 30-day ranking table. Labor is
// reported as hours (not a cost %) because the app doesn't track a wage
// rate per staff member — showing a fabricated labor cost would be worse
// than not showing one at all.
export async function getSummary(req, res) {
  try {
    const { restaurantId } = req;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7Start = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
    const prev7Start = new Date(todayStart.getTime() - 13 * 24 * 60 * 60 * 1000);
    const last30Start = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);

    const [locations, menuItems, inventoryItems] = await Promise.all([
      Location.find({ restaurantId }).sort({ createdAt: 1 }),
      MenuItem.find({ restaurantId }),
      Inventory.find({ restaurantId }),
    ]);

    if (locations.length === 0) {
      return res.json({ locations: [] });
    }

    const inventoryCostById = new Map(inventoryItems.map((i) => [i._id.toString(), i.costPerUnit]));
    const ingredientCostByMenuItemId = new Map(
      menuItems.map((m) => [m._id.toString(), computeIngredientCost(m, inventoryCostById)])
    );

    const [orders, attendanceRecords] = await Promise.all([
      Order.find(
        { restaurantId, status: { $in: SOLD_STATUSES.concat(OUTSTANDING_STATUSES) }, createdAt: { $gte: prev7Start } },
        'locationId status total remainingBalance items createdAt'
      ),
      Attendance.find(
        { restaurantId, createdAt: { $gte: last30Start } },
        'locationId duration createdAt'
      ),
    ]);

    const outstandingOrders = await Order.find(
      { restaurantId, status: { $in: OUTSTANDING_STATUSES } },
      'locationId remainingBalance total'
    );

    const result = locations.map((location) => {
      const locId = location._id.toString();
      const locOrders = orders.filter((o) => o.locationId?.toString() === locId);
      const soldOrders = locOrders.filter((o) => SOLD_STATUSES.includes(o.status));

      const todaySales = soldOrders
        .filter((o) => o.createdAt >= todayStart)
        .reduce((sum, o) => sum + o.total, 0);

      const last7Orders = soldOrders.filter((o) => o.createdAt >= last7Start);
      const prev7Orders = soldOrders.filter((o) => o.createdAt >= prev7Start && o.createdAt < last7Start);
      const sales7d = last7Orders.reduce((sum, o) => sum + o.total, 0);
      const salesPrev7d = prev7Orders.reduce((sum, o) => sum + o.total, 0);
      const salesTrendPercent = salesPrev7d > 0 ? ((sales7d - salesPrev7d) / salesPrev7d) * 100 : null;

      const dailySales = Array.from({ length: 7 }, (_, i) => {
        const dayStart = new Date(last7Start.getTime() + i * 24 * 60 * 60 * 1000);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const total = last7Orders
          .filter((o) => o.createdAt >= dayStart && o.createdAt < dayEnd)
          .reduce((sum, o) => sum + o.total, 0);
        return { date: dayStart.toISOString().slice(0, 10), total };
      });

      let ingredientCostTotal = 0;
      let hasCostData = false;
      for (const order of last7Orders) {
        for (const item of order.items) {
          const cost = ingredientCostByMenuItemId.get(String(item.menuItemId));
          if (cost !== null && cost !== undefined) {
            ingredientCostTotal += cost * item.quantity;
            hasCostData = true;
          }
        }
      }
      const foodCostPercent = hasCostData && sales7d > 0 ? (ingredientCostTotal / sales7d) * 100 : null;

      const laborSeconds = attendanceRecords
        .filter((a) => a.locationId?.toString() === locId && a.createdAt >= last7Start)
        .reduce((sum, a) => sum + durationToSeconds(a.duration), 0);

      const creditExposure = outstandingOrders
        .filter((o) => o.locationId?.toString() === locId)
        .reduce((sum, o) => sum + (o.remainingBalance ?? o.total), 0);

      return {
        id: location._id,
        name: location.name,
        address: location.address,
        isActive: location.isActive,
        todaySales,
        sales7d,
        salesTrendPercent,
        dailySales,
        foodCostPercent,
        foodCostStatus: statusFromFoodCost(foodCostPercent),
        laborHours7d: Math.round((laborSeconds / 3600) * 10) / 10,
        creditExposure,
      };
    });

    res.json({ locations: result });
  } catch (err) {
    req.log.error({ err }, 'Error computing head office summary');
    res.status(500).json({ error: 'Failed to compute head office summary' });
  }
}
