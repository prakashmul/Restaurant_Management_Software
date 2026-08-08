import Inventory from '../models/Inventory.js';
import Stock from '../models/Stock.js';
import StockHistory from '../models/StockHistory.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Vendor from '../models/Vendor.js';
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

  return items.map((item) => {
    const totalQuantity = qtyById.get(item._id.toString()) || 0;
    const threshold = item.lowStockThreshold || 0;
    return {
      ...item.toObject(),
      totalQuantity,
      isLowStock: threshold > 0 && totalQuantity < threshold,
    };
  });
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
    const { name, totalQuantity, unit, costPerUnit, lowStockThreshold, performedBy, description } = req.body;

    const newItem = await Inventory.create({
      restaurantId,
      name: name.trim(),
      unit: unit.trim(),
      costPerUnit,
      lowStockThreshold: lowStockThreshold || 0,
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
    const threshold = newItem.lowStockThreshold || 0;
    res.status(201).json({
      ...newItem.toObject(),
      totalQuantity: stock.totalQuantity,
      isLowStock: threshold > 0 && stock.totalQuantity < threshold,
    });
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
    const threshold = item.lowStockThreshold || 0;
    res.json({
      ...item.toObject(),
      totalQuantity: stock.totalQuantity,
      isLowStock: threshold > 0 && stock.totalQuantity < threshold,
    });
  } catch (err) {
    req.log.error({ err }, 'Error updating inventory');
    res.status(500).json({ error: 'Failed to update inventory stock' });
  }
}

// A structured alternative to the generic restock form for stock that's
// leaving inventory for a reason other than a sale — spoilage, breakage, a
// staff meal. Always deducts (the UI collects a positive "amount wasted";
// this stores it as a negative Stock/StockHistory quantity, same convention
// restockInventoryItem already uses for manual deductions).
export async function logWaste(req, res) {
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const { id } = req.params;
    const { quantity, wasteReason, performedBy, description } = req.body;

    const item = await Inventory.findOne({ _id: id, restaurantId });
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    const qtyToChange = -Math.abs(quantity);

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
      description: description || `Waste logged (${wasteReason})`,
      wasteReason,
    });

    emitChange('inventory');
    const threshold = item.lowStockThreshold || 0;
    res.json({
      ...item.toObject(),
      totalQuantity: stock.totalQuantity,
      isLowStock: threshold > 0 && stock.totalQuantity < threshold,
    });
  } catch (err) {
    req.log.error({ err }, 'Error logging waste');
    res.status(500).json({ error: 'Failed to log waste' });
  }
}

// Edits the ingredient's catalog metadata — name/unit/cost/threshold.
// Deliberately separate from restock, which only ever changes quantity, so
// "adjust stock" and "edit ingredient" stay two distinct, auditable actions.
export async function updateInventoryItem(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { name, unit, costPerUnit, lowStockThreshold, preferredVendorId, reorderQuantity, barcode } = req.body;

    const item = await Inventory.findOne({ _id: req.params.id, restaurantId });
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    if (preferredVendorId) {
      const vendor = await Vendor.findOne({ _id: preferredVendorId, restaurantId });
      if (!vendor) {
        return res.status(400).json({ message: 'That vendor does not belong to this restaurant.' });
      }
    }

    if (name !== undefined) item.name = name.trim();
    if (unit !== undefined) item.unit = unit.trim();
    if (costPerUnit !== undefined) item.costPerUnit = costPerUnit;
    if (lowStockThreshold !== undefined) item.lowStockThreshold = lowStockThreshold;
    if (preferredVendorId !== undefined) item.preferredVendorId = preferredVendorId || null;
    if (reorderQuantity !== undefined) item.reorderQuantity = reorderQuantity;
    if (barcode !== undefined) item.barcode = barcode ? barcode.trim() : null;
    await item.save();

    emitChange('inventory');
    const [withStock] = await attachStockQuantities([item], restaurantId, locationId);
    res.json(withStock);
  } catch (err) {
    req.log.error({ err }, 'Error updating inventory item');
    res.status(500).json({ error: 'Failed to update inventory item' });
  }
}

// Supplier price history is derived from received/reconciled purchase
// orders rather than a separate log — a PO already records what was paid,
// to whom, and when, so there's nothing to keep in sync separately.
export async function getPriceHistory(req, res) {
  try {
    const { restaurantId } = req;
    const { id } = req.params;

    const item = await Inventory.findOne({ _id: id, restaurantId });
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    const orders = await PurchaseOrder.find({
      restaurantId,
      status: { $in: ['received', 'reconciled'] },
      'items.inventoryItemId': item._id,
    }).sort({ receivedAt: -1 });

    const history = orders.map((po) => {
      const line = po.items.find((i) => i.inventoryItemId.toString() === item._id.toString());
      return {
        purchaseOrderId: po._id,
        vendorId: po.vendorId,
        vendorName: po.vendorName,
        unitCost: line.unitCost,
        quantity: line.quantity,
        receivedAt: po.receivedAt,
      };
    });

    res.json(history);
  } catch (err) {
    req.log.error({ err }, 'Error fetching price history');
    res.status(500).json({ error: 'Failed to fetch price history' });
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
