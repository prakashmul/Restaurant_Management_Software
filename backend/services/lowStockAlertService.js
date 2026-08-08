import Inventory from '../models/Inventory.js';
import Location from '../models/Location.js';
import Restaurant from '../models/Restaurant.js';
import StaffMembership from '../models/StaffMembership.js';
import { attachStockQuantities } from '../controllers/inventoryController.js';
import { sendEmail } from './notificationService.js';
import { logger } from '../middleware/logger.js';

// Checked every few hours (see server.js's cron schedule) but only actually
// sends once per this window per location, so a persistently low item
// doesn't re-alert on every check — just once a day until it's restocked
// above the threshold or the cooldown lapses again.
const ALERT_COOLDOWN_MS = 20 * 60 * 60 * 1000;

export async function checkLowStockAndAlert() {
  const locations = await Location.find({ isActive: true });
  for (const location of locations) {
    try {
      await checkLocationLowStock(location);
    } catch (err) {
      logger.error({ err, locationId: location._id }, 'Low-stock check failed for a location');
    }
  }
}

async function checkLocationLowStock(location) {
  if (location.lastLowStockAlertAt && Date.now() - location.lastLowStockAlertAt.getTime() < ALERT_COOLDOWN_MS) {
    return;
  }

  const items = await Inventory.find({ restaurantId: location.restaurantId, lowStockThreshold: { $gt: 0 } });
  if (items.length === 0) return;

  // Reuses the exact same isLowStock rule the Inventory page itself uses,
  // so this alert can never disagree with what a manager sees on screen.
  const withStock = await attachStockQuantities(items, location.restaurantId, location._id);
  const lowItems = withStock.filter((item) => item.isLowStock);
  if (lowItems.length === 0) return;

  const [restaurant, recipients] = await Promise.all([
    Restaurant.findById(location.restaurantId).select('name'),
    StaffMembership.find({
      restaurantId: location.restaurantId,
      role: { $in: ['Owner', 'Manager'] },
      $or: [{ locationId: null }, { locationId: location._id }],
    }).populate('userId', 'name email'),
  ]);
  if (recipients.length === 0) return;

  const restaurantName = restaurant?.name || 'Restaurant Management Software';
  const rows = lowItems
    .map(
      (item) =>
        `<li>${item.name}: ${item.totalQuantity.toFixed(2)} ${item.unit} left (alert threshold: ${item.lowStockThreshold} ${item.unit})</li>`
    )
    .join('');
  const html = `<p>These items are running low at ${location.name}:</p><ul>${rows}</ul>`;

  await Promise.all(
    recipients.map((r) =>
      sendEmail({
        restaurantName,
        to: r.userId.email,
        subject: `Low stock at ${location.name}`,
        html,
      })
    )
  );

  location.lastLowStockAlertAt = new Date();
  await location.save();
}
