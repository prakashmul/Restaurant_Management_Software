import Table from '../models/Table.js';
import Category from '../models/Category.js';
import { logger } from '../middleware/logger.js';

// Seeds a fresh database with starter tables/categories. Safe to run on
// every boot — only inserts when the respective collection is empty.
export async function seedInitialData() {
  try {
    const tblCount = await Table.countDocuments();
    if (tblCount === 0) {
      logger.info('Seeding initial tables...');
      await Table.insertMany([
        { number: 1, status: 'available', seats: 2 },
        { number: 2, status: 'available', seats: 4 },
        { number: 3, status: 'available', seats: 4 },
        { number: 4, status: 'available', seats: 6 },
      ]);
    }

    const catCount = await Category.countDocuments();
    if (catCount === 0) {
      logger.info('Seeding default categories...');
      await Category.insertMany([
        { name: 'Appetizer' },
        { name: 'Main Course' },
        { name: 'Dessert' },
        { name: 'Beverages' },
      ]);
    }
  } catch (err) {
    logger.error({ err }, 'Data seeding failed');
  }
}
