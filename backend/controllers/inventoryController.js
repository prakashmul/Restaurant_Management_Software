import Inventory from '../models/Inventory.js';
import StockHistory from '../models/StockHistory.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';
import { emitChange } from '../realtime/socket.js';

export async function listInventory(req, res) {
  try {
    const pagination = parsePagination(req);
    if (!pagination) {
      const inventory = await Inventory.find();
      return res.json(inventory);
    }
    const [data, total] = await Promise.all([
      Inventory.find().sort({ name: 1 }).skip(pagination.skip).limit(pagination.limit),
      Inventory.countDocuments(),
    ]);
    res.json(paginatedResponse(data, total, pagination));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
}

export async function createInventoryItem(req, res) {
  try {
    const { name, totalQuantity, unit, costPerUnit, performedBy, description } = req.body;

    const newItem = new Inventory({
      name: name.trim(),
      totalQuantity,
      unit: unit.trim(),
      costPerUnit,
    });

    const savedItem = await newItem.save();

    await StockHistory.create({
      itemId: savedItem._id,
      itemName: savedItem.name,
      quantity: totalQuantity,
      unit: savedItem.unit,
      performedBy: performedBy || 'Anonymous',
      description: description || 'Initial stock creation',
    });

    emitChange('inventory');
    res.status(201).json(savedItem);
  } catch (err) {
    req.log.error({ err }, 'Error creating inventory item');
    res.status(500).json({ error: 'Failed to create inventory item: ' + err.message });
  }
}

export async function restockInventoryItem(req, res) {
  try {
    const { id } = req.params;

    const qtyToChange = req.body.quantity !== undefined ? req.body.quantity : req.body.addQuantity;
    const { performedBy, description } = req.body;

    const item = await Inventory.findById(id);
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    item.totalQuantity = (Number(item.totalQuantity) || 0) + qtyToChange;
    await item.save();

    await StockHistory.create({
      itemId: item._id,
      itemName: item.name,
      quantity: qtyToChange,
      unit: item.unit,
      performedBy: performedBy || 'Anonymous',
      description: description || (qtyToChange > 0 ? 'Manual Restock' : 'Manual Deduction'),
    });

    emitChange('inventory');
    res.json(item);
  } catch (err) {
    req.log.error({ err }, 'Error updating inventory');
    res.status(500).json({ error: 'Failed to update inventory stock' });
  }
}

export async function listStockHistory(req, res) {
  try {
    const pagination = parsePagination(req);
    if (!pagination) {
      const logs = await StockHistory.find().sort({ createdAt: -1 });
      return res.json(logs);
    }
    const [data, total] = await Promise.all([
      StockHistory.find().sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
      StockHistory.countDocuments(),
    ]);
    res.json(paginatedResponse(data, total, pagination));
  } catch (err) {
    req.log.error({ err }, 'Error fetching stock history');
    res.status(500).json({ error: 'Failed to fetch stock history' });
  }
}
