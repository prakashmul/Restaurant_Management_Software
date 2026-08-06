import mongoose from 'mongoose';
import Restaurant from '../models/Restaurant.js';
import Location from '../models/Location.js';
import { logger } from '../middleware/logger.js';

// One-time (idempotent) migration splitting the old org-wide
// Inventory.totalQuantity into a per-location Stock document. Safe to run on
// every boot — only acts on Inventory documents that still carry a
// totalQuantity field. Existing quantity lands entirely on the restaurant's
// first Location (arbitrary but stable), since before this migration there
// was only ever one shared stock pool to begin with.
export async function migrateToLocationStock() {
  const db = mongoose.connection.db;

  try {
    const anyLegacyInventory = await db.collection('inventories').findOne({ totalQuantity: { $exists: true } });
    const anyOrphanedHistory = await db.collection('stockhistories').findOne({ locationId: { $exists: false } });
    if (!anyLegacyInventory && !anyOrphanedHistory) return;

    const restaurants = await Restaurant.find({});
    let anyRestaurantMigrated = false;

    for (const restaurant of restaurants) {
      const restaurantId = restaurant._id;

      const legacyItems = await db
        .collection('inventories')
        .find({ restaurantId, totalQuantity: { $exists: true } })
        .toArray();
      const orphanedHistoryCount = await db
        .collection('stockhistories')
        .countDocuments({ restaurantId, locationId: { $exists: false } });
      if (legacyItems.length === 0 && orphanedHistoryCount === 0) continue;

      const defaultLocation = await Location.findOne({ restaurantId }).sort({ createdAt: 1 });
      if (!defaultLocation) {
        logger.error(`Cannot migrate Inventory stock for restaurant ${restaurant.name} — no Location exists yet.`);
        continue;
      }

      anyRestaurantMigrated = true;

      for (const item of legacyItems) {
        await db.collection('stocks').updateOne(
          { restaurantId, locationId: defaultLocation._id, inventoryItemId: item._id },
          {
            $setOnInsert: {
              restaurantId,
              locationId: defaultLocation._id,
              inventoryItemId: item._id,
              totalQuantity: item.totalQuantity,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { upsert: true }
        );
        await db.collection('inventories').updateOne({ _id: item._id }, { $unset: { totalQuantity: '' } });
      }
      if (legacyItems.length > 0) {
        logger.info(
          `Migrated ${legacyItems.length} inventory item(s) to per-location stock for restaurant ${restaurant.name}`
        );
      }

      const historyRes = await db
        .collection('stockhistories')
        .updateMany({ restaurantId, locationId: { $exists: false } }, { $set: { locationId: defaultLocation._id } });
      if (historyRes.modifiedCount > 0) {
        logger.info(
          `Backfilled locationId on ${historyRes.modifiedCount} stock history entry(ies) for restaurant ${restaurant.name}`
        );
      }
    }

    if (anyRestaurantMigrated) {
      logger.info('Inventory-to-Stock migration complete.');
    }
  } catch (err) {
    logger.error({ err }, 'Inventory-to-Stock migration failed');
  }
}
