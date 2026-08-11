import mongoose from 'mongoose';
import Restaurant from '../models/Restaurant.js';
import Role from '../models/Role.js';
import { logger } from '../middleware/logger.js';
import { DEFAULT_ROLE_PERMISSIONS, DEFAULT_ROLE_DESCRIPTIONS, BUILT_IN_ROLE_NAMES } from '../permissions.js';

// One-time (idempotent) migration introducing the Role model. Safe to run on
// every boot — for each restaurant, seeds the 5 default roles if none exist
// yet, then backfills roleId on every StaffMembership still missing it by
// matching its current `role` display name to one of those roles. Existing
// staff keep exactly the access their role name implies today (the mockup's
// default permission set for that role name) — nobody's access silently
// changes shape, but note this DOES start real server-side enforcement
// where none existed before.
export async function migrateToRoles() {
  const db = mongoose.connection.db;

  try {
    const anyOrphanedMembership = await db.collection('staffmemberships').findOne({ roleId: { $exists: false } });
    if (!anyOrphanedMembership) return;

    const restaurants = await Restaurant.find({});
    let anyRestaurantMigrated = false;

    for (const restaurant of restaurants) {
      const restaurantId = restaurant._id;

      const orphanedCount = await db
        .collection('staffmemberships')
        .countDocuments({ restaurantId, roleId: { $exists: false } });
      if (orphanedCount === 0) continue;

      anyRestaurantMigrated = true;

      let roles = await Role.find({ restaurantId });
      if (roles.length === 0) {
        const docs = Object.keys(DEFAULT_ROLE_PERMISSIONS).map((name) => ({
          restaurantId,
          name,
          description: DEFAULT_ROLE_DESCRIPTIONS[name] || '',
          permissions: DEFAULT_ROLE_PERMISSIONS[name],
        }));
        roles = await Role.insertMany(docs);
        logger.info(`Seeded ${roles.length} default role(s) for restaurant ${restaurant.name}`);
      }
      const roleByName = new Map(roles.map((r) => [r.name, r]));

      const orphaned = await db
        .collection('staffmemberships')
        .find({ restaurantId, roleId: { $exists: false } })
        .toArray();

      for (const membership of orphaned) {
        let role = roleByName.get(membership.role);
        if (!role) {
          // A role name that doesn't match any of the 5 defaults (shouldn't
          // happen — `role` was a fixed enum until this migration) — fall
          // back to a role carrying no permissions rather than silently
          // granting access, and log it so it can be corrected by hand.
          logger.error(
            `StaffMembership ${membership._id} at restaurant ${restaurant.name} has unrecognized role "${membership.role}" — creating a permission-less placeholder role.`
          );
          role = await Role.create({ restaurantId, name: membership.role, permissions: [] });
          roleByName.set(membership.role, role);
        }
        await db.collection('staffmemberships').updateOne({ _id: membership._id }, { $set: { roleId: role._id } });
      }
      logger.info(`Backfilled roleId on ${orphaned.length} staff membership(s) for restaurant ${restaurant.name}`);
    }

    if (anyRestaurantMigrated) {
      logger.info('Role migration complete.');
    }
  } catch (err) {
    logger.error({ err }, 'Role migration failed');
  }
}

// Idempotent, additive-only, runs on every boot. When a new permission key
// is added to DEFAULT_ROLE_PERMISSIONS for a built-in role name (including
// Owner, whose already-seeded document predates the new key), this grants
// it to every existing restaurant's role of that name — but only ever adds
// missing keys, never removes one, so a manual customization an Owner made
// through the Roles screen is always preserved. Custom roles are never
// touched; an Owner grants those permissions by hand if they want them.
export async function syncBuiltInRolePermissions() {
  try {
    const roles = await Role.find({ name: { $in: BUILT_IN_ROLE_NAMES } });
    let totalUpdated = 0;

    for (const role of roles) {
      const defaults = DEFAULT_ROLE_PERMISSIONS[role.name] || [];
      const missing = defaults.filter((p) => !role.permissions.includes(p));
      if (missing.length === 0) continue;

      role.permissions = [...role.permissions, ...missing];
      await role.save();
      totalUpdated += 1;
      logger.info(
        `Added ${missing.length} new default permission(s) to "${role.name}" role (restaurant ${role.restaurantId}): ${missing.join(', ')}`
      );
    }

    if (totalUpdated > 0) {
      logger.info(`Built-in role permission sync complete — updated ${totalUpdated} role document(s).`);
    }
  } catch (err) {
    logger.error({ err }, 'Built-in role permission sync failed');
  }
}

// The new page.* keys (introduced alongside the page-level "Page Access"
// section) gate whole pages; before they existed, a page's visibility was
// implied by whichever finer action permission its data actually required
// (e.g. the Orders page needed orders.view). syncBuiltInRolePermissions
// above already backfills the 5 built-in role names via
// DEFAULT_ROLE_PERMISSIONS, but a restaurant's own custom roles are
// (deliberately, per that function's own doc comment) never touched by it —
// so without this, every custom role would suddenly lose every page the
// moment this ships. This infers each missing page.* key from whether the
// role already holds the legacy action key that used to stand in for it,
// preserving exactly the access a custom role already had. Idempotent,
// additive-only, safe to run on every boot.
const PAGE_KEY_TO_LEGACY_PERMISSION = {
  'page.pos': 'tables',
  'page.kitchen': 'orders.view',
  'page.inventory': 'stock.view',
  'page.orders': 'orders.view',
  'page.credits': 'credit.view',
  'page.customers': 'customers',
  'page.reservations': 'reservations.view',
  'page.headoffice': 'settings.headoffice',
  'page.recipecosting': 'recipecosting.view',
  'page.scheduling': 'scheduling.view',
  'page.procurement': 'procurement.view',
  'page.transfers': 'transfers.view',
  'page.staff': 'staff.view',
  'page.locations': 'locations.manage',
  'page.auditlog': 'audit.view',
  'page.settings': 'settings.restaurant',
};

export async function migrateCustomRolePageAccess() {
  try {
    const roles = await Role.find({ name: { $nin: BUILT_IN_ROLE_NAMES } });
    let totalUpdated = 0;

    for (const role of roles) {
      const toAdd = Object.entries(PAGE_KEY_TO_LEGACY_PERMISSION)
        .filter(([pageKey, legacyKey]) => role.permissions.includes(legacyKey) && !role.permissions.includes(pageKey))
        .map(([pageKey]) => pageKey);
      if (toAdd.length === 0) continue;

      role.permissions = [...role.permissions, ...toAdd];
      await role.save();
      totalUpdated += 1;
      logger.info(`Backfilled ${toAdd.length} page-access permission(s) onto custom role "${role.name}" (restaurant ${role.restaurantId}): ${toAdd.join(', ')}`);
    }

    if (totalUpdated > 0) {
      logger.info(`Custom role page-access backfill complete — updated ${totalUpdated} role document(s).`);
    }
  } catch (err) {
    logger.error({ err }, 'Custom role page-access backfill failed');
  }
}
