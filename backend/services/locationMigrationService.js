import mongoose from 'mongoose';
import Restaurant from '../models/Restaurant.js';
import Location from '../models/Location.js';
import { logger } from '../middleware/logger.js';

const LOCATION_SCOPED_COLLECTIONS = [
  'tables',
  'orders',
  'customers',
  'attendances',
  'shifts',
  'checklistcompletions',
  'purchaseorders',
];

async function dropIndexIfExists(db, collectionName, indexName) {
  try {
    await db.collection(collectionName).dropIndex(indexName);
    logger.info(`Dropped legacy single-location index ${indexName} on ${collectionName}`);
  } catch (err) {
    if (err.codeName !== 'IndexNotFound' && err.code !== 27) throw err;
  }
}

// One-time (idempotent) migration from single-location restaurants to
// Restaurant + Location. Safe to run on every boot — for each restaurant, it
// only acts if it finds location-scoped documents still missing a
// locationId, creating (or reusing) one "Main Location" to backfill them
// into. Existing StaffMembership records are left unrestricted (locationId
// null) so nobody loses access they already had.
export async function migrateToLocations() {
  const db = mongoose.connection.db;

  try {
    const anyOrphanedAnywhere = (
      await Promise.all(
        LOCATION_SCOPED_COLLECTIONS.map((name) => db.collection(name).findOne({ locationId: { $exists: false } }))
      )
    ).some(Boolean);
    if (!anyOrphanedAnywhere) return;

    // These fields used to be unique per-restaurant; a second location at
    // the same restaurant using the same table number / customer phone /
    // checklist-template-and-date would otherwise be blocked at the
    // database level once locationId exists but isn't part of the index yet.
    await dropIndexIfExists(db, 'tables', 'restaurantId_1_number_1');
    await dropIndexIfExists(db, 'customers', 'restaurantId_1_phone_1');
    await dropIndexIfExists(db, 'checklistcompletions', 'restaurantId_1_templateId_1_date_1');

    const restaurants = await Restaurant.find({});
    let anyRestaurantMigrated = false;

    for (const restaurant of restaurants) {
      const restaurantId = restaurant._id;

      const orphanedChecks = await Promise.all(
        LOCATION_SCOPED_COLLECTIONS.map((name) =>
          db.collection(name).findOne({ restaurantId, locationId: { $exists: false } })
        )
      );
      const anyOrphaned = orphanedChecks.some(Boolean);
      if (!anyOrphaned) continue;

      anyRestaurantMigrated = true;
      let defaultLocation = await Location.findOne({ restaurantId });
      if (!defaultLocation) {
        defaultLocation = await Location.create({
          restaurantId,
          name: 'Main Location',
          address: restaurant.address || '',
          phone: restaurant.phone || '',
          geofence: restaurant.geofence || { latitude: null, longitude: null, radiusMeters: 300 },
        });
        logger.info(`Created default Location "${defaultLocation.name}" for restaurant ${restaurant.name}`);
      }

      for (const name of LOCATION_SCOPED_COLLECTIONS) {
        const res = await db
          .collection(name)
          .updateMany(
            { restaurantId, locationId: { $exists: false } },
            { $set: { locationId: defaultLocation._id } }
          );
        if (res.modifiedCount > 0) {
          logger.info(`Backfilled locationId on ${res.modifiedCount} document(s) in ${name}`);
        }
      }

      const staffRes = await db
        .collection('staffmemberships')
        .updateMany(
          { restaurantId, locationId: { $exists: false } },
          { $set: { locationId: null } }
        );
      if (staffRes.modifiedCount > 0) {
        logger.info(`Set ${staffRes.modifiedCount} existing staff membership(s) to unrestricted (all locations)`);
      }
    }

    if (anyRestaurantMigrated) {
      logger.info('Location migration complete.');
    }
  } catch (err) {
    logger.error({ err }, 'Location migration failed');
  }
}
