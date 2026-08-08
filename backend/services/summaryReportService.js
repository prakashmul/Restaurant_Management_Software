import Location from '../models/Location.js';
import Restaurant from '../models/Restaurant.js';
import StaffMembership from '../models/StaffMembership.js';
import Order from '../models/Order.js';
import { sendEmail } from './notificationService.js';
import { logger } from '../middleware/logger.js';

// Same "recognized revenue" status set used for loyalty lifetime-spend and
// refund eligibility elsewhere in ordersController.js — a credit order is
// still real revenue for reporting purposes even though cash hasn't moved.
const RECOGNIZED_STATUSES = ['paid', 'credit', 'unsettled', 'settled'];

export async function sendDailySummaries() {
  const locations = await Location.find({ isActive: true });
  for (const location of locations) {
    try {
      await sendLocationDailySummary(location);
    } catch (err) {
      logger.error({ err, locationId: location._id }, 'Daily summary failed for a location');
    }
  }
}

async function sendLocationDailySummary(location) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const orders = await Order.find({
    restaurantId: location.restaurantId,
    locationId: location._id,
    status: { $in: RECOGNIZED_STATUSES },
    createdAt: { $gte: startOfDay, $lt: endOfDay },
  });

  // Nothing happened today — skip rather than send an empty email to every
  // restaurant every single day regardless of whether they even opened.
  if (orders.length === 0) return;

  const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);

  const [restaurant, recipients] = await Promise.all([
    Restaurant.findById(location.restaurantId).select('name currency'),
    StaffMembership.find({
      restaurantId: location.restaurantId,
      role: { $in: ['Owner', 'Manager'] },
      $or: [{ locationId: null }, { locationId: location._id }],
    }).populate('userId', 'name email'),
  ]);
  if (recipients.length === 0) return;

  const restaurantName = restaurant?.name || 'Restaurant Management Software';
  const currency = restaurant?.currency || 'Rs.';
  const dateLabel = startOfDay.toLocaleDateString();
  const html = `<p>Summary for ${location.name} — ${dateLabel}</p><ul><li>Orders: ${orders.length}</li><li>Total sales: ${currency} ${totalSales.toFixed(2)}</li></ul>`;

  await Promise.all(
    recipients.map((r) =>
      sendEmail({
        restaurantName,
        to: r.userId.email,
        subject: `Daily summary — ${location.name} (${dateLabel})`,
        html,
      })
    )
  );
}
