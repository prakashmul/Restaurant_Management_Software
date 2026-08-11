import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import { logger } from '../middleware/logger.js';

// Stock.costPerUnit didn't exist before per-location weighted-average
// costing — every location effectively showed the same org-wide
// Inventory.costPerUnit. Backfill each existing Stock doc with its
// ingredient's current org-wide cost as a starting point; from here on, a
// priced restock or PO receipt moves it independently per location. Safe to
// run on every boot — a Stock doc that already has a recorded cost
// (including 0, a deliberately free ingredient) is left untouched.
export async function migrateStockCostPerUnit() {
  const db = mongoose.connection.db;

  try {
    const anyMissing = await db.collection('stocks').findOne({ costPerUnit: { $exists: false } });
    if (!anyMissing) return;

    const inventoryItems = await Inventory.find({}).select('costPerUnit');
    const costById = new Map(inventoryItems.map((i) => [i._id.toString(), i.costPerUnit]));

    const cursor = db.collection('stocks').find({ costPerUnit: { $exists: false } });
    let ops = [];
    let totalBackfilled = 0;

    for await (const stock of cursor) {
      const cost = costById.get(stock.inventoryItemId.toString());
      if (cost === undefined) continue; // orphaned Stock doc — ingredient no longer exists

      ops.push({ updateOne: { filter: { _id: stock._id }, update: { $set: { costPerUnit: cost } } } });
      if (ops.length === 500) {
        const res = await db.collection('stocks').bulkWrite(ops);
        totalBackfilled += res.modifiedCount;
        ops = [];
      }
    }
    if (ops.length > 0) {
      const res = await db.collection('stocks').bulkWrite(ops);
      totalBackfilled += res.modifiedCount;
    }

    if (totalBackfilled > 0) {
      logger.info(`Backfilled costPerUnit on ${totalBackfilled} Stock document(s) from their ingredient's org-wide cost`);
    }
  } catch (err) {
    logger.error({ err }, 'Stock cost-per-unit migration failed');
  }
}
