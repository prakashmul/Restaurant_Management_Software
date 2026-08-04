import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Table from '../models/Table.js';
import Inventory from '../models/Inventory.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';
import { emitChange } from '../realtime/socket.js';
import { deductStockForOrder } from '../services/stockService.js';
import { findOrCreateCustomer } from '../services/customerService.js';

export async function listOrders(req, res) {
  try {
    const pagination = parsePagination(req);
    if (!pagination) {
      const orders = await Order.find();
      return res.json(orders);
    }
    const [data, total] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
      Order.countDocuments(),
    ]);
    res.json(paginatedResponse(data, total, pagination));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
}

// Atomically creates or updates the single pending order for a table. A
// partial unique index on {tableId, status:'pending'} (see models/Order.js)
// guarantees only one such document can exist even under concurrent
// requests from two terminals — one of them hits a duplicate-key error below.
export async function saveOrder(req, res) {
  const { tableId, items } = req.body;

  if (!tableId) {
    return res.status(400).json({ error: 'tableId is required' });
  }

  const session = await mongoose.startSession();
  try {
    let savedOrder;
    let tableNumber;

    await session.withTransaction(async () => {
      // Resolve Table whether tableId is a Mongoose ObjectId or a Table Number
      let table = null;
      if (mongoose.Types.ObjectId.isValid(tableId)) {
        table = await Table.findById(tableId).session(session);
      }
      if (!table && !isNaN(Number(tableId))) {
        table = await Table.findOne({ number: Number(tableId) }).session(session);
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
      }));

      const subtotal = formattedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const tax = subtotal * 0.08;
      const total = subtotal + tax;

      savedOrder = await Order.findOneAndUpdate(
        { tableId: validTableId, status: 'pending' },
        {
          $set: { tableId: validTableId, items: formattedItems, subtotal, tax, total, remainingBalance: total },
          $setOnInsert: { status: 'pending' },
        },
        { returnDocument: 'after', upsert: true, session }
      );

      await Table.findByIdAndUpdate(validTableId, { status: 'occupied' }, { session });
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

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await Order.findById(orderId).session(session);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (order.status === 'paid') throw Object.assign(new Error('Order is already paid'), { status: 400 });

      await deductStockForOrder(order, 'POS System', session);

      order.status = 'paid';
      order.paymentMethod = paymentMethod;
      order.remainingBalance = 0;
      order.paidAt = new Date();
      await order.save({ session });

      await Table.findByIdAndUpdate(order.tableId, { status: 'available' }, { session });
    });

    const updatedInventory = await Inventory.find();
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

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      order = await Order.findById(orderId).session(session);
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });

      await deductStockForOrder(order, 'POS System (Credit)', session);

      const customer = await findOrCreateCustomer({ name: customerName, phone: customerPhone }, session);

      order.status = 'credit';
      order.paymentMethod = 'credit';
      order.customerId = customer._id;
      order.customerName = customer.name;
      order.customerPhone = customer.phone || 'N/A';
      order.remainingBalance = order.total;
      await order.save({ session });

      await Table.findByIdAndUpdate(order.tableId, { status: 'available' }, { session });
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

export async function cancelTableOrder(req, res) {
  try {
    const { tableId } = req.params;
    let table = null;

    if (mongoose.Types.ObjectId.isValid(tableId)) {
      table = await Table.findById(tableId);
    }
    if (!table && !isNaN(Number(tableId))) {
      table = await Table.findOne({ number: Number(tableId) });
    }

    const targetTableId = table ? table._id : tableId;

    await Order.deleteMany({ tableId: targetTableId, status: 'pending' });
    if (table) {
      table.status = 'available';
      await table.save();
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
    await Order.findByIdAndDelete(req.params.id);
    emitChange('order');
    res.json({ message: 'Order deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
}
