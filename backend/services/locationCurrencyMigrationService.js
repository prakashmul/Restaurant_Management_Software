import mongoose from 'mongoose';
import Restaurant from '../models/Restaurant.js';
import Location from '../models/Location.js';
import { logger } from '../middleware/logger.js';

// Currency used to live only on Restaurant, shared by every branch. Now each
// Location has its own currency (default 'Rs.'), so an existing tenant's
// locations need to be backfilled from their restaurant's current currency
// the first time this runs, rather than silently resetting to 'Rs.' for a
// tenant who had already changed it. Safe to run on every boot — a location
// that already has a stored currency is left untouched.
export async function migrateLocationCurrency() {
  const db = mongoose.connection.db;

  try {
    const anyMissing = await db.collection('locations').findOne({ currency: { $exists: false } });
    if (!anyMissing) return;

    const restaurants = await Restaurant.find({}).select('currency');
    let totalBackfilled = 0;

    for (const restaurant of restaurants) {
      const res = await db
        .collection('locations')
        .updateMany(
          { restaurantId: restaurant._id, currency: { $exists: false } },
          { $set: { currency: restaurant.currency || 'Rs.' } }
        );
      totalBackfilled += res.modifiedCount;
    }

    if (totalBackfilled > 0) {
      logger.info(`Backfilled currency on ${totalBackfilled} location(s) from their restaurant's currency`);
    }
  } catch (err) {
    logger.error({ err }, 'Location currency migration failed');
  }
}
