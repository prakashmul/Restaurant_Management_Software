import Table from '../models/Table.js';
import Category from '../models/Category.js';
import { logger } from '../middleware/logger.js';

const DEFAULT_CATEGORIES = ['Appetizer', 'Main Course', 'Dessert', 'Beverages'];

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
