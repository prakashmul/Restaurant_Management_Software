import Table from '../models/Table.js';
import Category from '../models/Category.js';
import Role from '../models/Role.js';
import { logger } from '../middleware/logger.js';
import { DEFAULT_ROLE_PERMISSIONS, DEFAULT_ROLE_DESCRIPTIONS } from '../permissions.js';

const DEFAULT_CATEGORIES = ['Appetizer', 'Main Course', 'Dessert', 'Beverages'];

// Creates the 5 built-in roles for a brand-new restaurant. Called before any
// StaffMembership exists so the Owner's membership can reference the
// returned Owner role's _id immediately. Must run inside the caller's
// transaction session — a restaurant without at least an Owner role would
// be unusable.
export async function seedDefaultRoles(restaurantId, session) {
  const docs = Object.keys(DEFAULT_ROLE_PERMISSIONS).map((name) => ({
    restaurantId,
    name,
    description: DEFAULT_ROLE_DESCRIPTIONS[name] || '',
    permissions: DEFAULT_ROLE_PERMISSIONS[name],
  }));
  return Role.insertMany(docs, { session });
}

// Called once, when a brand-new restaurant is created (self-serve signup),
// so the Owner doesn't land in a completely empty POS with no starting point.
// Categories are organization-wide (shared menu across locations), so they
// aren't scoped to the new location the way the starter Table is.
export async function seedNewRestaurant(restaurantId, locationId, session) {
  try {
    await Table.create([{ restaurantId, locationId, number: 1, seats: 4, status: 'available' }], { session });
    await Category.insertMany(
      DEFAULT_CATEGORIES.map((name) => ({ restaurantId, name })),
      { session }
    );
  } catch (err) {
    logger.error({ err }, 'Default seeding for new restaurant failed');
  }
}
