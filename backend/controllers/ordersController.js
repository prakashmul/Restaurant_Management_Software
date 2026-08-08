import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Table from '../models/Table.js';
import Inventory from '../models/Inventory.js';
import Restaurant from '../models/Restaurant.js';
import Customer from '../models/Customer.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';
import { emitChange } from '../realtime/socket.js';
import { deductStockForOrder, restoreStockForOrder } from '../services/stockService.js';
import { attachStockQuantities } from './inventoryController.js';
import { findOrCreateCustomer } from '../services/customerService.js';
import { logAudit } from '../services/auditService.js';
import { toCsv } from '../utils/csv.js';

// Falls back to 8% if the restaurant somehow has no rate configured (should
// never happen — Restaurant.taxRatePercent defaults to 8) rather than
// charging 0% tax by accident.
async function getTaxRate(restaurantId, session) {
  const restaurant = await Restaurant.findById(restaurantId).select('taxRatePercent').session(session || null);
  const percent = restaurant?.taxRatePercent ?? 8;
  return percent / 100;
}

// Recomputes tax/total/remainingBalance from the order's currently-stored
// discount and tip snapshots. Shared by applyDiscount and applyTip so the
// two can be applied in either order (or removed) without desyncing —
// each mutation always reads the other's already-committed amount.
function recomputeOrderTotals(order, taxRate) {
  const discountAmount = order.discount?.amount || 0;
  const tipAmount = order.tip?.amount || 0;
  const taxableBase = order.subtotal - discountAmount;
  order.tax = taxableBase * taxRate;
  order.total = taxableBase + order.tax + tipAmount;
  order.remainingBalance = order.total;
}

export async function listOrders(req, res) {
  try {
    const query = { restaurantId: req.restaurantId };
    if (req.locationId) query.locationId = req.locationId;

    const pagination = parsePagination(req);
    if (!pagination) {
      const orders = await Order.find(query);
      return res.json(orders);
    }
    const [data, total] = await Promise.all([
      Order.find(query).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
      Order.countDocuments(query),
    ]);
    res.json(paginatedResponse(data, total, pagination));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

const CSV_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'orderId', label: 'Order ID' },
  { key: 'status', label: 'Status' },
  { key: 'paymentMethod', label: 'Payment Method' },
  { key: 'customerName', label: 'Customer' },
  { key: 'subtotal', label: 'Subtotal' },
  { key: 'discount', label: 'Discount' },
  { key: 'tax', label: 'Tax' },
  { key: 'tip', label: 'Tip' },
  { key: 'total', label: 'Total' },
];

// Non-pending orders in a date range, shaped for handoff to an accountant —
// one row per order, financial fields only (no line items).
export async function exportOrdersCsv(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { startDate, endDate } = req.query;

    const query = { restaurantId, status: { $ne: 'pending' } };
    if (locationId) query.locationId = locationId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(`${startDate}T00:00:00Z`);
      if (endDate) query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const orders = await Order.find(query).sort({ createdAt: 1 });

    const rows = orders.map((o) => ({
      date: o.createdAt ? o.createdAt.toISOString().slice(0, 10) : '',
      orderId: o._id.toString().slice(-6),
      status: o.status,
      paymentMethod: o.paymentMethod || '',
      customerName: o.customerName || '',
      subtotal: (o.subtotal || 0).toFixed(2),
      discount: (o.discount?.amount || 0).toFixed(2),
      tax: (o.tax || 0).toFixed(2),
      tip: (o.tip?.amount || 0).toFixed(2),
      total: (o.total || 0).toFixed(2),
    }));

    const csv = toCsv(rows, CSV_COLUMNS);
    const filename = `sales-export-${startDate || 'all'}-to-${endDate || 'now'}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    req.log.error({ err }, 'Error exporting orders CSV');
    res.status(500).json({ error: 'Failed to export orders' });
  }
}

// Atomically creates or updates the single pending order for a table. A
// partial unique index on {restaurantId, tableId, status:'pending'} (see
// models/Order.js) guarantees only one such document can exist even under
// concurrent requests from two terminals — one of them hits a duplicate-key
// error below.
export async function saveOrder(req, res) {
  const { tableId, items } = req.body;
  const { restaurantId, locationId } = req;

  if (!tableId) {
    return res.status(400).json({ error: 'tableId is required' });
  }
  if (!locationId) {
    return res.status(400).json({ error: 'Select a location first' });
  }

  const session = await mongoose.startSession();
  try {
    let savedOrder;
    let tableNumber;

    await session.withTransaction(async () => {
      // Resolve Table whether tableId is a Mongoose ObjectId or a Table Number
      let table = null;
      if (mongoose.Types.ObjectId.isValid(tableId)) {
        table = await Table.findOne({ _id: tableId, restaurantId, locationId }).session(session);
      }
      if (!table && !isNaN(Number(tableId))) {
        table = await Table.findOne({ restaurantId, locationId, number: Number(tableId) }).session(session);
      }

      if (!table) {
        throw Object.assign(new Error(`Table not found for identifier: ${tableId}`), { status: 400 });
      }

      const validTableId = table._id;
      tableNumber = table.number;

      const formattedItems = (items || []).map((item) => ({
        menuItemId: String(item.menuItemId || item.id || item._id || ''),
        name: item.name || 'Unnamed Item',
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 1,
        // Carried through as-sent (the client's cart is populated from this
        // same order's own items, so a previously-bumped/seat-assigned line
        // survives re-saving the order to add more items) rather than reset.
        bumped: Boolean(item.bumped),
        seatNumber: item.seatNumber ?? null,
      }));

      const subtotal = formattedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const taxRate = await getTaxRate(restaurantId, session);

      // A discount/tip already applied to this table's pending order must
      // survive adding more items — re-derive each against the new subtotal
      // (percent-based ones scale, flat ones stay put but re-cap at the new
      // subtotal for discount) rather than silently dropping out of the total.
      const existingOrder = await Order.findOne({ restaurantId, tableId: validTableId, status: 'pending' }).session(session);

      const discount = existingOrder?.discount?.type
        ? {
            type: existingOrder.discount.type,
            value: existingOrder.discount.value,
            reason: existingOrder.discount.reason,
            amount:
              existingOrder.discount.type === 'percent'
                ? subtotal * (existingOrder.discount.value / 100)
                : Math.min(subtotal, existingOrder.discount.value),
          }
        : { type: null, value: 0, reason: '', amount: 0 };

      const taxableBase = subtotal - discount.amount;

      const tip = existingOrder?.tip?.type
        ? {
            type: existingOrder.tip.type,
            value: existingOrder.tip.value,
            amount: existingOrder.tip.type === 'percent' ? taxableBase * (existingOrder.tip.value / 100) : existingOrder.tip.value,
          }
        : { type: null, value: 0, amount: 0 };

      const tax = taxableBase * taxRate;
      const total = taxableBase + tax + tip.amount;

      savedOrder = await Order.findOneAndUpdate(
        { restaurantId, tableId: validTableId, status: 'pending' },
        {
          $set: {
            restaurantId,
            locationId,
            tableId: validTableId,
            items: formattedItems,
            subtotal,
            discount,
            tip,
            tax,
            total,
            remainingBalance: total,
          },
          $setOnInsert: { status: 'pending' },
        },
        { returnDocument: 'after', upsert: true, session }
      );

      await Table.findOneAndUpdate(
        { _id: validTableId, restaurantId, locationId },
        { status: 'occupied' },
        { session }
      );
    });

    req.log.info(`[Order Save] Saved pending order ${savedOrder._id} for Table ${tableNumber}`);
    emitChange('order');
    emitChange('table');
    return res.status(200).json(savedOrder);
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ error: 'This table was just updated by another request. Please try again.' });
    }
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'Server error during order save');
    return res.status(status).json({ error: err.status ? err.message : 'Failed to save order.' });
  } finally {
    session.endSession();
  }
}

export async function payOrder(req, res) {
  const { orderId } = req.params;
  const { paymentMethod } = req.body;
  const { restaurantId, locationId } = req;

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await Order.findOne({ _id: orderId, restaurantId, locationId }).session(session);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (order.status === 'paid') throw Object.assign(new Error('Order is already paid'), { status: 400 });

      await deductStockForOrder(order, 'POS System', session);

      order.status = 'paid';
      order.paymentMethod = paymentMethod;
      order.remainingBalance = 0;
      order.paidAt = new Date();
      await order.save({ session });

      await Table.findOneAndUpdate(
        { _id: order.tableId, restaurantId, locationId },
        { status: 'available' },
        { session }
      );
    });

    const inventoryItems = await Inventory.find({ restaurantId });
    const updatedInventory = await attachStockQuantities(inventoryItems, restaurantId, locationId);
    emitChange('order');
    emitChange('table');
    emitChange('inventory');
    res.json({ message: 'Bill paid & stock deducted successfully', order, inventory: updatedInventory });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'Error processing payment');
    res.status(status).json({ message: err.status ? err.message : 'Failed to process payment.' });
  } finally {
    session.endSession();
  }
}

export async function creditOrder(req, res) {
  const { orderId } = req.params;
  const { customerName, customerPhone } = req.body;
  const { restaurantId, locationId } = req;

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await Order.findOne({ _id: orderId, restaurantId, locationId }).session(session);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

      await deductStockForOrder(order, 'POS System (Credit)', session);

      const customer = await findOrCreateCustomer(
        { name: customerName, phone: customerPhone },
        restaurantId,
        locationId,
        session
      );

      order.status = 'credit';
      order.paymentMethod = 'credit';
      order.customerId = customer._id;
      order.customerName = customer.name;
      order.customerPhone = customer.phone || 'N/A';
      order.remainingBalance = order.total;
      await order.save({ session });

      await Table.findOneAndUpdate(
        { _id: order.tableId, restaurantId, locationId },
        { status: 'available' },
        { session }
      );
    });

    emitChange('order');
    emitChange('table');
    emitChange('inventory');
    res.json({ message: 'Order recorded to Credit Ledger successfully', order });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'Error processing credit order');
    res.status(status).json({ message: err.status ? err.message : 'Failed to process credit order.' });
  } finally {
    session.endSession();
  }
}

// There's no real payment gateway (no card/wallet processor is wired up),
// so a refund is an internal ledger reversal only: it restores the stock
// deducted at payment/credit time and moves the order to 'refunded', which
// simply drops it out of every revenue and credit-ledger query (those all
// filter on the specific statuses that mean "money is owed or was
// collected" — see SOLD_STATUSES/OUTSTANDING_STATUSES across the reporting
// controllers) — no separate "reverse the credit balance" step is needed
// since nothing about a customer's balance is stored outside these orders.
// Only orders where money/inventory were already committed can be
// refunded; a still-pending order has neither yet, so it's voided instead
// (see cancelTableOrder/deleteOrder above).
const REFUNDABLE_STATUSES = ['paid', 'credit', 'unsettled', 'settled'];

export async function refundOrder(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  const { restaurantId, locationId } = req;

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await Order.findOne({ _id: id, restaurantId, locationId }).session(session);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (!REFUNDABLE_STATUSES.includes(order.status)) {
        throw Object.assign(
          new Error(`An order with status "${order.status}" cannot be refunded.`),
          { status: 400 }
        );
      }

      await restoreStockForOrder(order, `Refund (${req.user.name || req.user.email})`, session);

      const refundAmount = order.total;
      order.status = 'refunded';
      order.remainingBalance = 0;
      order.refundedAt = new Date();
      order.refundHistory.push({ amount: refundAmount, reason, refundedBy: req.user.name || req.user.email });
      await order.save({ session });
    });

    await logAudit(
      restaurantId,
      req.user,
      `refunded order #${order._id.toString().slice(-6)} for Rs. ${order.total.toLocaleString()} (${reason})`,
      locationId
    );

    emitChange('order');
    emitChange('inventory');
    res.json(order);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'Error refunding order');
    res.status(status).json({ message: err.status ? err.message : 'Failed to refund order.' });
  } finally {
    session.endSession();
  }
}

// Kitchen Display System — only pending orders have anything left to
// prepare (paid/credit/etc. orders are already done and off the kitchen's
// plate), oldest first so the ticket that's been waiting longest is on top.
export async function getKitchenOrders(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const query = { restaurantId, status: 'pending' };
    if (locationId) query.locationId = locationId;

    const orders = await Order.find(query).sort({ createdAt: 1 });
    res.json(orders);
  } catch (err) {
    req.log.error({ err }, 'Error fetching kitchen orders');
    res.status(500).json({ error: 'Failed to fetch kitchen orders' });
  }
}

// Toggles one line item's prep status. Per-item (not per-order) so a ticket
// with multiple courses can show partial progress. Only meaningful on a
// pending order — once paid/credited, the kitchen's job on it is over.
export async function bumpOrderItem(req, res) {
  try {
    const { orderId, itemId } = req.params;
    const { restaurantId, locationId } = req;

    const order = await Order.findOne({ _id: orderId, restaurantId, locationId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Only items on a pending order can be bumped.' });
    }

    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Order item not found' });
    }

    item.bumped = !item.bumped;
    await order.save();

    emitChange('order');
    res.json(order);
  } catch (err) {
    req.log.error({ err }, 'Error bumping order item');
    res.status(500).json({ error: 'Failed to update item' });
  }
}

// Discounts apply to the subtotal before tax, and only to a still-pending
// order — once it's paid or on credit, the money has already been recorded,
// so re-opening the total would desync it from what was actually collected.
export async function applyDiscount(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { type, value, reason } = req.body;

    const order = await Order.findOne({ _id: req.params.id, restaurantId, locationId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Discounts can only be applied to a pending order.' });
    }

    let discountAmount = 0;
    if (type === 'percent') {
      discountAmount = order.subtotal * (value / 100);
    } else if (type === 'flat') {
      discountAmount = value;
    }
    discountAmount = Math.min(order.subtotal, Math.max(0, discountAmount));

    order.discount = type ? { type, value, reason, amount: discountAmount } : { type: null, value: 0, reason: '', amount: 0 };
    const taxRate = await getTaxRate(order.restaurantId);
    recomputeOrderTotals(order, taxRate);
    await order.save();

    const description = type
      ? `applied a ${type === 'percent' ? `${value}%` : `Rs. ${value}`} discount to an order${reason ? ` (${reason})` : ''}`
      : 'removed a discount from an order';
    await logAudit(restaurantId, req.user, description, locationId);

    emitChange('order');
    res.json(order);
  } catch (err) {
    req.log.error({ err }, 'Error applying discount');
    res.status(500).json({ error: 'Failed to apply discount' });
  }
}

// Attaches a loyalty-tracked customer to a still-pending order — the
// prerequisite for redeeming points at checkout, but also useful on its own
// (any order, any tender type, can now be tied to a returning customer, not
// just credit orders). Reuses the same lookup-or-create as the credit flow
// so a phone number always resolves to the same Customer record either way.
export async function attachOrderCustomer(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { customerName, customerPhone } = req.body;

    const order = await Order.findOne({ _id: req.params.id, restaurantId, locationId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'A customer can only be attached to a pending order.' });
    }

    const customer = await findOrCreateCustomer({ name: customerName, phone: customerPhone }, restaurantId, locationId);
    order.customerId = customer._id;
    order.customerName = customer.name;
    order.customerPhone = customer.phone || 'N/A';
    await order.save();

    emitChange('order');
    res.json(order);
  } catch (err) {
    req.log.error({ err }, 'Error attaching customer to order');
    res.status(500).json({ error: 'Failed to attach customer' });
  }
}

// Redeems loyalty points as a flat discount on a pending order — shares the
// order's single discount slot with applyDiscount above (a table can't have
// both a manual discount and a points redemption at once), and shares its
// same "amount clamped to subtotal, only while pending" rules. Points
// earned are derived (never stored — see customersController.js); only the
// redemption itself is a real, persisted ledger entry on the customer.
export async function redeemLoyaltyPoints(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { points } = req.body;

    const order = await Order.findOne({ _id: req.params.id, restaurantId, locationId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Points can only be redeemed on a pending order.' });
    }
    if (!order.customerId) {
      return res.status(400).json({ message: 'Attach a customer to this order before redeeming points.' });
    }
    if (order.discount?.type) {
      return res.status(400).json({ message: 'Remove the existing discount before redeeming loyalty points.' });
    }

    const [customer, restaurant] = await Promise.all([
      Customer.findOne({ _id: order.customerId, restaurantId }),
      Restaurant.findById(restaurantId).select('loyaltyEarnRatePerRs loyaltyPointValueRs'),
    ]);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    const loyaltyEarnRatePerRs = restaurant?.loyaltyEarnRatePerRs ?? 0.01;
    const loyaltyPointValueRs = restaurant?.loyaltyPointValueRs ?? 1;

    const priorOrders = await Order.find({
      restaurantId,
      customerId: customer._id,
      status: { $in: ['paid', 'credit', 'unsettled', 'settled'] },
    }).select('total');
    const lifetimeSpend = priorOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const pointsEarned = Math.floor(lifetimeSpend * loyaltyEarnRatePerRs);
    const pointsAvailable = Math.max(0, pointsEarned - (customer.pointsRedeemed || 0));

    if (points > pointsAvailable) {
      return res.status(400).json({ message: `Only ${pointsAvailable} point(s) are available to redeem.` });
    }

    const discountAmount = Math.min(order.subtotal, points * loyaltyPointValueRs);
    order.discount = {
      type: 'flat',
      value: discountAmount,
      reason: `Redeemed ${points} loyalty point(s)`,
      amount: discountAmount,
    };
    const taxRate = await getTaxRate(restaurantId);
    recomputeOrderTotals(order, taxRate);
    await order.save();

    customer.pointsRedeemed = (customer.pointsRedeemed || 0) + points;
    await customer.save();

    await logAudit(
      restaurantId,
      req.user,
      `redeemed ${points} loyalty point(s) (Rs. ${discountAmount.toFixed(2)}) for ${customer.name}`,
      locationId
    );

    emitChange('order');
    res.json({ order, pointsRedeemed: points, pointsRemaining: pointsAvailable - points });
  } catch (err) {
    req.log.error({ err }, 'Error redeeming loyalty points');
    res.status(500).json({ error: 'Failed to redeem loyalty points' });
  }
}

// Tips apply after tax and are never taxed themselves. Like discounts, only
// a still-pending order can be tipped — once paid, the money is recorded.
export async function applyTip(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { type, value } = req.body;

    const order = await Order.findOne({ _id: req.params.id, restaurantId, locationId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ message: 'Tips can only be applied to a pending order.' });
    }

    const taxableBase = order.subtotal - (order.discount?.amount || 0);
    let tipAmount = 0;
    if (type === 'percent') {
      tipAmount = taxableBase * (value / 100);
    } else if (type === 'flat') {
      tipAmount = value;
    }
    tipAmount = Math.max(0, tipAmount);

    order.tip = type ? { type, value, amount: tipAmount } : { type: null, value: 0, amount: 0 };
    const taxRate = await getTaxRate(order.restaurantId);
    recomputeOrderTotals(order, taxRate);
    await order.save();

    const description = type
      ? `added a ${type === 'percent' ? `${value}%` : `Rs. ${value}`} tip to an order`
      : 'removed a tip from an order';
    await logAudit(restaurantId, req.user, description, locationId);

    emitChange('order');
    res.json(order);
  } catch (err) {
    req.log.error({ err }, 'Error applying tip');
    res.status(500).json({ error: 'Failed to apply tip' });
  }
}

export async function cancelTableOrder(req, res) {
  try {
    const { tableId } = req.params;
    const { restaurantId, locationId } = req;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    let table = null;

    if (mongoose.Types.ObjectId.isValid(tableId)) {
      table = await Table.findOne({ _id: tableId, restaurantId, locationId });
    }
    if (!table && !isNaN(Number(tableId))) {
      table = await Table.findOne({ restaurantId, locationId, number: Number(tableId) });
    }

    const targetTableId = table ? table._id : tableId;

    await Order.deleteMany({ restaurantId, tableId: targetTableId, status: 'pending' });
    if (table) {
      table.status = 'available';
      await table.save();
      const suffix = reason ? ` (reason: ${reason})` : '';
      await logAudit(restaurantId, req.user, `cancelled the pending order for Table #${table.number}${suffix}`, locationId);
    }

    emitChange('order');
    emitChange('table');
    res.json({ message: 'Pending order cancelled successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel pending order' });
  }
}

export async function deleteOrder(req, res) {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const deleted = await Order.findOneAndDelete({
      _id: req.params.id,
      restaurantId: req.restaurantId,
      locationId: req.locationId,
    });
    if (deleted) {
      const suffix = reason ? ` (reason: ${reason})` : '';
      await logAudit(req.restaurantId, req.user, `deleted order #${deleted._id.toString().slice(-6)}${suffix}`, req.locationId);
    }
    emitChange('order');
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
}
