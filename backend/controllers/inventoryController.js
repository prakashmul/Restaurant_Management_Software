import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import Stock from '../models/Stock.js';
import StockHistory from '../models/StockHistory.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Vendor from '../models/Vendor.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';
import { emitChange } from '../realtime/socket.js';
import { receiveStockAtCost } from '../services/stockService.js';

// Merges each org-wide Inventory (ingredient catalog) item with its on-hand
// quantity and cost. When a location is selected, that's the location's own
// Stock document; when unscoped, quantity is summed across every location so
// the number still means something ("all locations combined").
//
// Cost works the same way but is never a plain sum: it's tracked per
// location (Stock.costPerUnit — see the weighted-average costing feature),
// with Inventory.costPerUnit as the fallback for a location that's never
// actually received this ingredient yet. Scoped to one location, the result
// is that location's own cost. Unscoped, it's a quantity-weighted blend
// across every location that has a recorded cost — the aggregate/Head
// Office view of "roughly what this ingredient costs across the org."
export async function attachStockQuantities(items, restaurantId, locationId) {
  const itemIds = items.map((i) => i._id);
  const stockQuery = { restaurantId, inventoryItemId: { $in: itemIds } };
  if (locationId) stockQuery.locationId = locationId;
  const stocks = await Stock.find(stockQuery);

  const stocksById = new Map();
  for (const stock of stocks) {
    const key = stock.inventoryItemId.toString();
    if (!stocksById.has(key)) stocksById.set(key, []);
    stocksById.get(key).push(stock);
  }

  return items.map((item) => {
    const locationStocks = stocksById.get(item._id.toString()) || [];
    const totalQuantity = locationStocks.reduce((sum, s) => sum + s.totalQuantity, 0);
    const threshold = item.lowStockThreshold || 0;

    let costPerUnit = item.costPerUnit;
    const costed = locationStocks.filter((s) => s.costPerUnit != null);
    if (costed.length > 0) {
      const costedQty = costed.reduce((sum, s) => sum + s.totalQuantity, 0);
      // If every costed location's quantity is currently 0 (or negative),
      // there's nothing to weight by — fall back to the most recently
      // recorded cost instead of dividing by zero.
      costPerUnit =
        costedQty > 0
          ? costed.reduce((sum, s) => sum + s.totalQuantity * s.costPerUnit, 0) / costedQty
          : costed[costed.length - 1].costPerUnit;
    }

    return {
      ...item.toObject(),
      costPerUnit,
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
      costPerUnit,
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
  const session = await mongoose.startSession();
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const { id } = req.params;

    const qtyToChange = req.body.quantity !== undefined ? req.body.quantity : req.body.addQuantity;
    const { performedBy, description, unitCost } = req.body;
    // A price only makes sense when stock is actually being added — a manual
    // deduction (correcting a miscount, etc.) never carries a cost basis.
    const isPricedReceipt = unitCost != null && qtyToChange > 0;

    const item = await Inventory.findOne({ _id: id, restaurantId });
    if (!item) {
      return res.status(404).json({ message: 'Inventory item not found' });
    }

    let stock;
    await session.withTransaction(async () => {
      if (isPricedReceipt) {
        stock = await receiveStockAtCost({
          restaurantId,
          locationId,
          inventoryItemId: item._id,
          quantity: qtyToChange,
          unitCost,
          fallbackCost: item.costPerUnit,
          session,
        });
      } else {
        stock = await Stock.findOneAndUpdate(
          { restaurantId, locationId, inventoryItemId: item._id },
          { $inc: { totalQuantity: qtyToChange } },
          { new: true, upsert: true, session }
        );
      }

      await StockHistory.create(
        [
          {
            restaurantId,
            locationId,
            itemId: item._id,
            itemName: item.name,
            quantity: qtyToChange,
            unit: item.unit,
            performedBy: performedBy || 'Anonymous',
            description:
              description ||
              (isPricedReceipt
                ? `Manual Restock @ ${unitCost}/${item.unit}`
                : qtyToChange > 0
                ? 'Manual Restock'
                : 'Manual Deduction'),
          },
        ],
        { session }
      );
    });

    emitChange('inventory');
    const threshold = item.lowStockThreshold || 0;
    res.json({
      ...item.toObject(),
      costPerUnit: stock.costPerUnit ?? item.costPerUnit,
      totalQuantity: stock.totalQuantity,
      isLowStock: threshold > 0 && stock.totalQuantity < threshold,
    });
  } catch (err) {
    req.log.error({ err }, 'Error updating inventory');
    res.status(500).json({ error: 'Failed to update inventory stock' });
  } finally {
    session.endSession();
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

    // A direct cost edit here is a manual correction ("this number is just
    // wrong"), not a purchase — so it overwrites the current location's
    // weighted-average cost outright rather than blending into it like a
    // priced restock/PO receipt does. Inventory.costPerUnit above still
    // updates too, as the fallback for locations with no stock history yet.
    if (costPerUnit !== undefined && locationId) {
      await Stock.findOneAndUpdate(
        { restaurantId, locationId, inventoryItemId: item._id },
        { $set: { costPerUnit } },
        { upsert: true }
      );
    }

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
