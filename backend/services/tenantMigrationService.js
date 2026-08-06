import mongoose from 'mongoose';
import Restaurant from '../models/Restaurant.js';
import StaffMembership from '../models/StaffMembership.js';
import { logger } from '../middleware/logger.js';

const LEGACY_RESTAURANT_SLUG = 'real-deal';

const TENANT_SCOPED_COLLECTIONS = [
  'tables',
  'categories',
  'menuitems',
  'inventories',
  'stockhistories',
  'orders',
  'customers',
  'attendances',
];

async function dropIndexIfExists(db, collectionName, indexName) {
  try {
    await db.collection(collectionName).dropIndex(indexName);
    logger.info(`Dropped legacy global-unique index ${indexName} on ${collectionName}`);
  } catch (err) {
    if (err.codeName !== 'IndexNotFound' && err.code !== 27) throw err;
  }
}

// One-time (idempotent) migration from the pre-multi-tenant single-restaurant
// data model to Restaurant + StaffMembership. Safe to run on every boot — it
// only acts when it finds documents still missing a restaurantId, and only
// creates a StaffMembership for a user who doesn't already have one.
export async function migrateToMultiTenant() {
  const db = mongoose.connection.db;

  try {
    const needsMigration = await db
      .collection('tables')
      .findOne({ restaurantId: { $exists: false } });
    const anyOrphaned = needsMigration
      ? true
      : (
          await Promise.all(
            TENANT_SCOPED_COLLECTIONS.map((name) =>
              db.collection(name).findOne({ restaurantId: { $exists: false } })
            )
          )
        ).some(Boolean);

    if (!anyOrphaned) return;

    logger.info('Pre-multi-tenant data detected — migrating to the Restaurant/StaffMembership model...');

    // These fields used to be globally unique; a second restaurant using the
    // same table number / category name / customer phone as the first one
    // would otherwise be blocked at the database level.
    await dropIndexIfExists(db, 'tables', 'number_1');
    await dropIndexIfExists(db, 'categories', 'name_1');
    await dropIndexIfExists(db, 'customers', 'phone_1');

    let restaurant = await Restaurant.findOne({ slug: LEGACY_RESTAURANT_SLUG });
    if (!restaurant) {
      restaurant = await Restaurant.create({
        name: 'Real Deal KTV Bar and Restaurant',
        slug: LEGACY_RESTAURANT_SLUG,
        address: '120 Mc feild, Eastern Avenue, Georgetown',
        phone: '+1(345) 329-7700',
        logoUrl: '/assets/Logo.jpeg',
        currency: 'Rs.',
        taxRatePercent: 8,
        geofence: { latitude: 27.694147, longitude: 85.269939, radiusMeters: 300 },
      });
      logger.info(`Created legacy Restaurant record: ${restaurant._id}`);
    }

    for (const name of TENANT_SCOPED_COLLECTIONS) {
      const res = await db
        .collection(name)
        .updateMany({ restaurantId: { $exists: false } }, { $set: { restaurantId: restaurant._id } });
      if (res.modifiedCount > 0) {
        logger.info(`Backfilled restaurantId on ${res.modifiedCount} document(s) in ${name}`);
      }
    }

    // Migrate each User's old `role` field into a StaffMembership. Read raw
    // documents — the User schema no longer declares `role`, so a hydrated
    // Mongoose document wouldn't expose the old stored value.
    const rawUsers = await db.collection('users').find({}).toArray();
    for (const rawUser of rawUsers) {
      const existing = await StaffMembership.findOne({ userId: rawUser._id, restaurantId: restaurant._id });
      if (existing) continue;

      // 'Staff' had broad access under the old two-role model — Manager is
      // the closest equivalent under the new one, so nobody loses access
      // they already had.
      const role = rawUser.role === 'Owner' ? 'Owner' : 'Manager';
      await StaffMembership.create({ userId: rawUser._id, restaurantId: restaurant._id, role });
      logger.info(`Created StaffMembership for ${rawUser.email} as ${role}`);
    }

    await db.collection('users').updateMany({}, { $unset: { role: '' } });

    logger.info('Multi-tenant migration complete.');
  } catch (err) {
    logger.error({ err }, 'Multi-tenant migration failed');
  }
}
