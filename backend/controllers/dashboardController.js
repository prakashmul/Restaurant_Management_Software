import Order from '../models/Order.js';
import MenuItem from '../models/MenuItem.js';
import Inventory from '../models/Inventory.js';
import Expense from '../models/Expense.js';
import { attachStockQuantities } from './inventoryController.js';
import { computeIngredientCost } from '../utils/ingredientCost.js';
import { rangeStart, rangeEnd } from '../utils/dateRange.js';
import { getPaymentEvents } from '../utils/paymentEvents.js';

function isWithinRange(date, start, end) {
  const d = new Date(date);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

// Powers the Dashboard's Restaurant Overview cards. Optional startDate/
// endDate scope every figure to that range; omitted, it's all-time for this
// location (or every location combined, if unscoped).
//
// Gross Sales / Paid Revenue / Gross Profit are all cash-basis: built from
// each order's individual payment events (see getPaymentEvents), counted on
// the day the money actually moved, not the day the order was created. A
// credit order that hasn't been paid at all yet contributes nothing; a
// partial payment shows up the moment it happens, on its own date. Gross
// Sales is every event (direct + credit payments combined); Paid Revenue is
// direct (non-credit) events only — mirrors "Total Amount Received" vs
// "Today's Sale" on the Order History page.
//
// Gross Profit apportions each order's ingredient cost to whatever share of
// its total was actually paid in this range — e.g. a 200 order costing 75
// to make, with only a 50 partial credit payment landing in this range,
// contributes 50 * (1 - 75/200) = 31.25 of profit here; the rest lands
// wherever the remaining payments do.
//
// Total Orders counts orders CREATED in this range — a period count, unlike
// the payment-event figures above. Credit Owed is an all-time snapshot of
// what's currently outstanding (a balance, not something that happened "in"
// a date range), so it's deliberately never scoped by startDate/endDate.
//
// Net Profit is Gross Profit minus operating expenses (rent, salaries,
// utilities, etc. — see Expense model) logged in the same date range.
export async function getDashboardSummary(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { startDate, endDate } = req.query;

    const rangeStartDate = startDate ? rangeStart(startDate) : null;
    const rangeEndDate = endDate ? rangeEnd(endDate) : null;

    // Payment events can land on any date at or after an order was created,
    // so the only safe pre-filter at the query level is an upper bound on
    // createdAt — an order created after the range's end can't have a
    // payment inside it. The startDate lower bound is applied in memory
    // below, per payment event rather than per order.
    const orderQuery = { restaurantId, status: { $ne: 'cancelled' } };
    if (locationId) orderQuery.locationId = locationId;
    if (rangeEndDate) orderQuery.createdAt = { $lte: rangeEndDate };

    const creditOrderQuery = { restaurantId, status: { $in: ['credit', 'unsettled'] } };
    if (locationId) creditOrderQuery.locationId = locationId;

    const expenseQuery = { restaurantId };
    if (locationId) expenseQuery.locationId = locationId;
    if (rangeStartDate || rangeEndDate) {
      expenseQuery.date = {};
      if (rangeStartDate) expenseQuery.date.$gte = rangeStartDate;
      if (rangeEndDate) expenseQuery.date.$lte = rangeEndDate;
    }

    const [orders, creditOrders, menuItems, inventoryItems, expenses] = await Promise.all([
      Order.find(orderQuery),
      Order.find(creditOrderQuery).select('remainingBalance total'),
      MenuItem.find({ restaurantId }),
      Inventory.find({ restaurantId }),
      Expense.find(expenseQuery),
    ]);

    const costedInventory = await attachStockQuantities(inventoryItems, restaurantId, locationId);
    const inventoryCostById = new Map(costedInventory.map((i) => [i._id.toString(), i.costPerUnit]));
    const menuItemById = new Map(menuItems.map((m) => [m._id.toString(), m]));

    let grossSales = 0;
    let netPaidSales = 0;
    let grossProfit = 0;
    let totalOrdersCount = 0;
    let dishesMissingCostData = false;

    for (const order of orders) {
      if (isWithinRange(order.createdAt, rangeStartDate, rangeEndDate)) {
        totalOrdersCount += 1;
      }

      const eventsInRange = getPaymentEvents(order).filter((event) =>
        isWithinRange(event.date, rangeStartDate, rangeEndDate)
      );
      if (eventsInRange.length === 0) continue;

      const revenueInRange = eventsInRange.reduce((sum, e) => sum + e.amount, 0);
      grossSales += revenueInRange;
      netPaidSales += eventsInRange
        .filter((e) => e.type === 'direct')
        .reduce((sum, e) => sum + e.amount, 0);

      let orderCost = 0;
      let hasCostData = true;
      for (const item of order.items) {
        const menuItem = menuItemById.get(String(item.menuItemId));
        if (!menuItem) {
          hasCostData = false;
          continue;
        }
        const unitCost = computeIngredientCost(menuItem, inventoryCostById);
        if (unitCost === null) {
          hasCostData = false;
          continue;
        }
        orderCost += unitCost * item.quantity;
      }

      if (!hasCostData) {
        dishesMissingCostData = true;
        // No reliable cost data — treat as 0 cost (same permissive fallback
        // as before) rather than dropping this revenue from profit.
        grossProfit += revenueInRange;
      } else {
        const costRatio = order.total > 0 ? orderCost / order.total : 0;
        grossProfit += revenueInRange * (1 - costRatio);
      }
    }

    const creditOwed = creditOrders.reduce((sum, o) => sum + (o.remainingBalance ?? o.total ?? 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = grossProfit - totalExpenses;

    res.json({
      grossSales,
      netPaidSales,
      creditOwed,
      totalOrdersCount,
      grossProfit,
      totalExpenses,
      netProfit,
      // Lets the UI note that a dish with no costed recipe was excluded from
      // Gross/Net Profit (0 cost assumed) rather than silently understating
      // the true expense.
      dishesMissingCostData,
    });
  } catch (err) {
    req.log.error({ err }, 'Error computing dashboard summary');
    res.status(500).json({ error: 'Failed to compute dashboard summary' });
  }
}
