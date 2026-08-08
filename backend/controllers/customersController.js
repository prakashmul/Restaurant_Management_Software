import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Restaurant from '../models/Restaurant.js';
import { logAudit } from '../services/auditService.js';

const SPEND_STATUSES = ['paid', 'credit', 'unsettled', 'settled'];
const OUTSTANDING_STATUSES = ['credit', 'unsettled'];

// Points earned are deliberately never stored — always recomputed from
// lifetime spend so they can't drift from the order history that backs
// them. Only redemption (Customer.pointsRedeemed) is a real, persisted
// ledger, since that's the one number that can't be re-derived after the
// fact. See redeemLoyaltyPoints in ordersController.js for the write side.
function toCustomerDTO(customer, stats, loyaltyEarnRatePerRs) {
  const pointsEarned = Math.floor((stats?.lifetimeSpend || 0) * loyaltyEarnRatePerRs);
  const pointsRedeemed = customer.pointsRedeemed || 0;
  return {
    _id: customer._id,
    name: customer.name,
    phone: customer.phone,
    locationId: customer.locationId,
    ordersCount: stats?.ordersCount || 0,
    lifetimeSpend: stats?.lifetimeSpend || 0,
    outstandingCredit: stats?.outstandingCredit || 0,
    lastOrderAt: stats?.lastOrderAt || null,
    pointsEarned,
    pointsRedeemed,
    pointsBalance: Math.max(0, pointsEarned - pointsRedeemed),
  };
}

export async function listCustomers(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const query = { restaurantId };
    if (locationId) query.locationId = locationId;

    const [customers, restaurant] = await Promise.all([
      Customer.find(query).sort({ name: 1 }),
      Restaurant.findById(restaurantId).select('loyaltyEarnRatePerRs'),
    ]);
    const loyaltyEarnRatePerRs = restaurant?.loyaltyEarnRatePerRs ?? 0.01;
    const orders = await Order.find(
      { restaurantId, customerId: { $in: customers.map((c) => c._id) } },
      'customerId total status remainingBalance createdAt'
    );

    const statsByCustomer = new Map();
    for (const order of orders) {
      const key = order.customerId.toString();
      const stats = statsByCustomer.get(key) || {
        ordersCount: 0,
        lifetimeSpend: 0,
        outstandingCredit: 0,
        lastOrderAt: null,
      };
      stats.ordersCount += 1;
      if (SPEND_STATUSES.includes(order.status)) stats.lifetimeSpend += order.total;
      if (OUTSTANDING_STATUSES.includes(order.status)) {
        stats.outstandingCredit += order.remainingBalance ?? order.total;
      }
      if (!stats.lastOrderAt || order.createdAt > stats.lastOrderAt) stats.lastOrderAt = order.createdAt;
      statsByCustomer.set(key, stats);
    }

    res.json(customers.map((c) => toCustomerDTO(c, statsByCustomer.get(c._id.toString()), loyaltyEarnRatePerRs)));
  } catch (err) {
    req.log.error({ err }, 'Error fetching customers');
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
}

export async function getCustomer(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const query = { _id: req.params.id, restaurantId };
    if (locationId) query.locationId = locationId;

    const customer = await Customer.findOne(query);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const [orders, restaurant] = await Promise.all([
      Order.find({ restaurantId, customerId: customer._id }).sort({ createdAt: -1 }),
      Restaurant.findById(restaurantId).select('loyaltyEarnRatePerRs'),
    ]);
    const loyaltyEarnRatePerRs = restaurant?.loyaltyEarnRatePerRs ?? 0.01;

    let lifetimeSpend = 0;
    let outstandingCredit = 0;
    for (const order of orders) {
      if (SPEND_STATUSES.includes(order.status)) lifetimeSpend += order.total;
      if (OUTSTANDING_STATUSES.includes(order.status)) outstandingCredit += order.remainingBalance ?? order.total;
    }
    const pointsEarned = Math.floor(lifetimeSpend * loyaltyEarnRatePerRs);
    const pointsRedeemed = customer.pointsRedeemed || 0;

    res.json({
      customer: { _id: customer._id, name: customer.name, phone: customer.phone, locationId: customer.locationId },
      stats: {
        ordersCount: orders.length,
        lifetimeSpend,
        outstandingCredit,
        pointsEarned,
        pointsRedeemed,
        pointsBalance: Math.max(0, pointsEarned - pointsRedeemed),
      },
      orders,
    });
  } catch (err) {
    req.log.error({ err }, 'Error fetching customer');
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
}

export async function updateCustomer(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { name, phone } = req.body;
    const query = { _id: req.params.id, restaurantId };
    if (locationId) query.locationId = locationId;

    const customer = await Customer.findOne(query);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    if (name !== undefined) customer.name = name;
    if (phone !== undefined) customer.phone = phone;
    await customer.save();

    await logAudit(restaurantId, req.user, `updated customer profile for ${customer.name}`, customer.locationId);
    res.json(toCustomerDTO(customer));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Another customer at this location already uses that phone number.' });
    }
    req.log.error({ err }, 'Error updating customer');
    res.status(500).json({ error: 'Failed to update customer' });
  }
}
