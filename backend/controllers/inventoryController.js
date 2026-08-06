import Inventory from '../models/Inventory.js';
import Stock from '../models/Stock.js';
import StockHistory from '../models/StockHistory.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';
import { emitChange } from '../realtime/socket.js';

// Merges each org-wide Inventory (ingredient catalog) item with its on-hand
// quantity. When a location is selected, that's the location's own Stock
// document; when unscoped, quantities are summed across every location so
// the number still means something ("all locations combined").
export async function attachStockQuantities(items, restaurantId, locationId) {
  const itemIds = items.map((i) => i._id);
  const stockQuery = { restaurantId, inventoryItemId: { $in: itemIds } };
  if (locationId) stockQuery.locationId = locationId;
  const stocks = await Stock.find(stockQuery);

  const qtyById = new Map();
  for (const stock of stocks) {
    const key = stock.inventoryItemId.toString();
    qtyById.set(key, (qtyById.get(key) || 0) + stock.totalQuantity);
  }

  return items.map((item) => ({
    ...item.toObject(),
    totalQuantity: qtyById.get(item._id.toString()) || 0,
  }));
}

export async function listInventory(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const pagination = parsePagination(req);
    if (!pagination) {
      const inventory = await Inventory.find({ restaurantId });
      return res.json(await attachStockQuantities(inventory, restaurantId, locationId));
    }
    const [data, total] = await Promise.all([
      Inventory.find({ restaurantId }).sort({ name: 1 }).skip(pagination.skip).limit(pagination.limit),
      Inventory.countDocuments({ restaurantId }),
    ]);
    res.json(paginatedResponse(await attachStockQuantities(data, restaurantId, locationId), total, pagination));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
}

export async function createInventoryItem(req, res) {
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const { name, totalQuantity, unit, costPerUnit, performedBy, description } = req.body;

    const newItem = await Inventory.create({
      restaurantId,
      name: name.trim(),
      unit: unit.trim(),
      costPerUnit,
    });

    const stock = await Stock.create({
      restaurantId,
      locationId,
      inventoryItemId: newItem._id,
      totalQuantity,
    });

    await StockHistory.create({
      restaurantId,
      locationId,
      itemId: newItem._id,
      itemName: newItem.name,
      quantity: totalQuantity,
      unit: newItem.unit,
      performedBy: performedBy || 'Anonymous',
      description: description || 'Initial stock creation',
    });

    emitChange('inventory');
    res.status(201).json({ ...newItem.toObject(), totalQuantity: stock.totalQuantity });
  } catch (err) {
    req.log.error({ err }, 'Error creating inventory item');
    res.status(500).json({ error: 'Failed to create inventory item: ' + err.message });
  }
}

export async function restockInventoryItem(req, res) {
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const { id } = req.params;

    const qtyToChange = req.body.quantity !== undefined ? req.body.quantity : req.body.addQuantity;
    const { performedBy, description } = req.body;

    const item = await Inventory.findOne({ _id: id, restaurantId });
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    const stock = await Stock.findOneAndUpdate(
      { restaurantId, locationId, inventoryItemId: item._id },
      { $inc: { totalQuantity: qtyToChange } },
      { new: true, upsert: true }
    );

    await StockHistory.create({
      restaurantId,
      locationId,
      itemId: item._id,
      itemName: item.name,
      quantity: qtyToChange,
      unit: item.unit,
      performedBy: performedBy || 'Anonymous',
      description: description || (qtyToChange > 0 ? 'Manual Restock' : 'Manual Deduction'),
    });

    emitChange('inventory');
    res.json({ ...item.toObject(), totalQuantity: stock.totalQuantity });
  } catch (err) {
    req.log.error({ err }, 'Error updating inventory');
    res.status(500).json({ error: 'Failed to update inventory stock' });
  }
}

export async function listStockHistory(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const query = { restaurantId };
    if (locationId) query.locationId = locationId;

    const pagination = parsePagination(req);
    if (!pagination) {
      const logs = await StockHistory.find(query).sort({ createdAt: -1 });
      return res.json(logs);
    }
    const [data, total] = await Promise.all([
      StockHistory.find(query).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
      StockHistory.countDocuments(query),
    ]);
    res.json(paginatedResponse(data, total, pagination));
  } catch (err) {
    req.log.error({ err }, 'Error fetching stock history');
    res.status(500).json({ error: 'Failed to fetch stock history' });
  }
}
