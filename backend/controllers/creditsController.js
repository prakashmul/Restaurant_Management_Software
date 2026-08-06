import Order from '../models/Order.js';
import Customer from '../models/Customer.js';
import { emitChange } from '../realtime/socket.js';
import { logAudit } from '../services/auditService.js';

export async function getCreditLedger(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const creditOrders = await Order.find({
      restaurantId,
      ...(locationId ? { locationId } : {}),
      $or: [{ paymentMethod: 'credit' }, { status: { $in: ['credit', 'unsettled', 'settled'] } }],
    });

    const customerMap = {};

    creditOrders.forEach((order) => {
      const key = order.customerId
        ? order.customerId.toString()
        : order.customerPhone && order.customerPhone !== 'N/A'
        ? order.customerPhone
        : order.customerName;

      if (!customerMap[key]) {
        customerMap[key] = {
          id: key,
          name: order.customerName,
          phone: order.customerPhone,
          ordersCount: 0,
          debtOwed: 0,
          originalAmount: 0,
          isFullySettled: true,
          notesHistory: [],
          orderIds: [],
        };
      }

      const remBalance = order.remainingBalance ?? order.total;

      customerMap[key].ordersCount += 1;
      customerMap[key].debtOwed += remBalance;
      customerMap[key].originalAmount += order.total;
      customerMap[key].orderIds.push(order._id);

      if (remBalance > 0 && order.status !== 'settled') {
        customerMap[key].isFullySettled = false;
      }

      if (order.paymentHistory && order.paymentHistory.length > 0) {
        order.paymentHistory.forEach((log) => {
          const dateStr = new Date(log.createdAt).toLocaleDateString();
          customerMap[key].notesHistory.push(
            `Paid Rs. ${log.amount.toLocaleString()} on ${dateStr}${log.note ? ` (${log.note})` : ''}`
          );
        });
      }
    });

    res.json(Object.values(customerMap));
  } catch (err) {
    req.log.error({ err }, 'Error fetching credit ledger');
    res.status(500).json({ error: 'Failed to fetch credit ledger' });
  }
}

// Prefer matching by the resolved Customer record; fall back to the legacy
// name/phone string match for any pre-migration orders.
async function resolveCreditQuery(customerPhone, customerName, restaurantId, locationId) {
  const customer = await Customer.findOne(
    customerPhone
      ? { restaurantId, locationId, phone: customerPhone }
      : { restaurantId, locationId, name: customerName, phone: '' }
  );
  return {
    restaurantId,
    locationId,
    status: { $in: ['credit', 'unsettled'] },
    ...(customer ? { customerId: customer._id } : { $or: [{ customerPhone }, { customerName }] }),
  };
}

export async function partialCreditPay(req, res) {
  try {
    const { customerPhone, customerName, amount, note } = req.body;
    const { restaurantId, locationId } = req;
    const payAmount = amount;

    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }

    const query = await resolveCreditQuery(customerPhone, customerName, restaurantId, locationId);
    const creditOrders = await Order.find(query).sort({ createdAt: 1 });

    if (creditOrders.length === 0) {
      return res.status(404).json({ message: 'No active credit orders found for this customer' });
    }

    let remainingToDeduct = payAmount;

    for (const order of creditOrders) {
      if (remainingToDeduct <= 0) break;

      const currentBalance = order.remainingBalance ?? order.total;

      if (remainingToDeduct >= currentBalance) {
        remainingToDeduct -= currentBalance;
        order.remainingBalance = 0;
        order.status = 'settled';
        order.paidAt = new Date();
        order.paymentHistory.push({
          amount: currentBalance,
          note: note || 'Partial payment auto-settled order',
          type: 'full',
        });
      } else {
        order.remainingBalance = currentBalance - remainingToDeduct;
        order.paymentHistory.push({
          amount: remainingToDeduct,
          note: note || 'Partial payment received',
          type: 'partial',
        });
        remainingToDeduct = 0;
      }

      await order.save();
    }

    await logAudit(
      restaurantId,
      req.user,
      `recorded a partial payment of Rs. ${payAmount.toLocaleString()} for ${customerName || customerPhone}`,
      locationId
    );
    emitChange('order');
    res.json({ message: 'Partial payment applied successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error applying partial payment');
    res.status(500).json({ error: 'Failed to apply partial payment' });
  }
}

export async function fullSettleCredit(req, res) {
  try {
    const { customerPhone, customerName } = req.body;
    const { restaurantId, locationId } = req;

    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }

    const query = await resolveCreditQuery(customerPhone, customerName, restaurantId, locationId);
    const creditOrders = await Order.find(query);

    let totalSettled = 0;
    for (const order of creditOrders) {
      const remaining = order.remainingBalance ?? order.total;
      totalSettled += remaining;
      order.remainingBalance = 0;
      order.status = 'settled';
      order.paidAt = new Date();
      order.paymentHistory.push({
        amount: remaining,
        note: 'Marked as Fully Settled',
        type: 'full',
      });
      await order.save();
    }

    if (creditOrders.length > 0) {
      await logAudit(
        restaurantId,
        req.user,
        `settled a full credit balance of Rs. ${totalSettled.toLocaleString()} for ${customerName || customerPhone}`,
        locationId
      );
    }
    emitChange('order');
    res.json({ message: 'All credit orders fully settled successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error settling credit orders');
    res.status(500).json({ error: 'Failed to fully settle credit orders' });
  }
}
