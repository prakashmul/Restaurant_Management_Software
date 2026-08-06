import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import { logger } from '../middleware/logger.js';

// Finds the Customer record matching this phone (primary key) or name
// (fallback for walk-ins with no phone) within one location, creating one
// if none exists yet.
export async function findOrCreateCustomer({ name, phone }, restaurantId, locationId, session) {
  const cleanPhone = (phone || '').trim();
  const cleanName = (name || '').trim() || 'Walk-in Customer';
  const validPhone = cleanPhone && cleanPhone !== 'N/A' ? cleanPhone : '';

  const query = validPhone
    ? { restaurantId, locationId, phone: validPhone }
    : { restaurantId, locationId, name: cleanName, phone: '' };
  const existing = await Customer.findOne(query).session(session ?? null);
  if (existing) {
    if (cleanName !== 'Walk-in Customer' && existing.name !== cleanName) {
      existing.name = cleanName;
      await existing.save({ session });
    }
    return existing;
  }

  const created = await Customer.create(
    [{ restaurantId, locationId, name: cleanName, phone: validPhone }],
    { session }
  );
  return created[0];
}

// One-time (idempotent) backfill: attaches a Customer record to any credit
// order that predates the Customer collection. Safe to run on every boot —
// it only touches orders where customerId is still null. Each order already
// carries its own restaurantId (backfilled by the multi-tenant migration
// that runs immediately before this one), so customers land in the right tenant.
export async function migrateOrdersToCustomers() {
  try {
    const ordersNeedingMigration = await Order.find({
      customerId: null,
      $or: [{ paymentMethod: 'credit' }, { status: { $in: ['credit', 'unsettled', 'settled'] } }],
    });

    if (ordersNeedingMigration.length === 0) return;

    logger.info(`Backfilling Customer records for ${ordersNeedingMigration.length} existing credit order(s)...`);

    for (const order of ordersNeedingMigration) {
      const customer = await findOrCreateCustomer(
        { name: order.customerName, phone: order.customerPhone },
        order.restaurantId,
        order.locationId
      );
      order.customerId = customer._id;
      await order.save();
    }

    logger.info('Customer backfill complete.');
  } catch (err) {
    logger.error({ err }, 'Customer backfill failed');
  }
}
