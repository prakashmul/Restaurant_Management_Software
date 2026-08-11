import mongoose from 'mongoose';
import Vendor from '../models/Vendor.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import Inventory from '../models/Inventory.js';
import Stock from '../models/Stock.js';
import StockHistory from '../models/StockHistory.js';
import User from '../models/User.js';
import { emitChange } from '../realtime/socket.js';
import { logAudit } from '../services/auditService.js';
import { attachStockQuantities } from './inventoryController.js';
import { getCurrencySymbol } from '../utils/currency.js';

const ALLOWED_TRANSITIONS = {
  draft: ['sent'],
  sent: ['received'],
  received: ['reconciled'],
  reconciled: [],
};

// Groups every low-stock item that has both a preferred vendor and a target
// reorder quantity configured (see Inventory.preferredVendorId/reorderQuantity)
// into one draft-PO suggestion per vendor. An item missing either field is
// left out — there's nothing actionable to draft without both.
export async function getSuggestedOrders(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const inventory = await Inventory.find({
      restaurantId,
      preferredVendorId: { $ne: null },
      reorderQuantity: { $gt: 0 },
    });
    if (inventory.length === 0) return res.json([]);

    const withStock = await attachStockQuantities(inventory, restaurantId, locationId);
    const lowStockItems = withStock.filter((i) => i.isLowStock);
    if (lowStockItems.length === 0) return res.json([]);

    const vendorIds = [...new Set(lowStockItems.map((i) => i.preferredVendorId.toString()))];
    const vendors = await Vendor.find({ _id: { $in: vendorIds }, restaurantId });
    const vendorById = new Map(vendors.map((v) => [v._id.toString(), v]));

    const suggestionsByVendor = new Map();
    for (const item of lowStockItems) {
      const vendorId = item.preferredVendorId.toString();
      const vendor = vendorById.get(vendorId);
      if (!vendor) continue; // vendor deleted since being set as preferred

      if (!suggestionsByVendor.has(vendorId)) {
        suggestionsByVendor.set(vendorId, { vendorId, vendorName: vendor.name, items: [] });
      }
      suggestionsByVendor.get(vendorId).items.push({
        inventoryItemId: item._id,
        itemName: item.name,
        unit: item.unit,
        currentQuantity: item.totalQuantity,
        lowStockThreshold: item.lowStockThreshold,
        reorderQuantity: item.reorderQuantity,
        unitCost: item.costPerUnit,
      });
    }

    res.json(Array.from(suggestionsByVendor.values()));
  } catch (err) {
    req.log.error({ err }, 'Error computing suggested purchase orders');
    res.status(500).json({ error: 'Failed to compute suggested purchase orders' });
  }
}

export async function listVendors(req, res) {
  try {
    const vendors = await Vendor.find({ restaurantId: req.restaurantId }).sort({ name: 1 });
    res.json(vendors);
  } catch (err) {
    req.log.error({ err }, 'Error fetching vendors');
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
}

export async function createVendor(req, res) {
  try {
    const vendor = await Vendor.create({ restaurantId: req.restaurantId, ...req.body });
    res.status(201).json(vendor);
  } catch (err) {
    req.log.error({ err }, 'Error creating vendor');
    res.status(500).json({ error: 'Failed to create vendor' });
  }
}

export async function deleteVendor(req, res) {
  try {
    const { restaurantId } = req;
    const hasPurchaseOrders = await PurchaseOrder.exists({ vendorId: req.params.id, restaurantId });
    if (hasPurchaseOrders) {
      return res.status(400).json({
        message: 'Cannot delete this vendor because it has purchase order history. Vendors with history stay for record-keeping.',
      });
    }
    const deleted = await Vendor.findOneAndDelete({ _id: req.params.id, restaurantId });
    if (!deleted) {
      return res.status(404).json({ message: 'Vendor not found' });
    }
    res.json({ message: 'Vendor deleted successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting vendor');
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
}

export async function listPurchaseOrders(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const query = { restaurantId };
    if (locationId) query.locationId = locationId;
    if (req.query.status) query.status = req.query.status;

    const orders = await PurchaseOrder.find(query).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    req.log.error({ err }, 'Error fetching purchase orders');
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
}

export async function createPurchaseOrder(req, res) {
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const { vendorId, items } = req.body;

    const vendor = await Vendor.findOne({ _id: vendorId, restaurantId });
    if (!vendor) {
      return res.status(404).json({ message: 'Vendor not found' });
    }

    const inventoryIds = items.map((i) => i.inventoryItemId);
    const inventoryItems = await Inventory.find({ _id: { $in: inventoryIds }, restaurantId });
    const inventoryById = new Map(inventoryItems.map((i) => [i._id.toString(), i]));

    const resolvedItems = [];
    for (const item of items) {
      const invItem = inventoryById.get(item.inventoryItemId);
      if (!invItem) {
        return res.status(400).json({ message: `Inventory item ${item.inventoryItemId} not found` });
      }
      resolvedItems.push({
        inventoryItemId: invItem._id,
        itemName: invItem.name,
        unit: invItem.unit,
        quantity: item.quantity,
        unitCost: item.unitCost,
      });
    }

    const totalAmount = resolvedItems.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
    const user = await User.findById(req.user.id).select('name');

    const po = await PurchaseOrder.create({
      restaurantId,
      locationId,
      vendorId: vendor._id,
      vendorName: vendor.name,
      items: resolvedItems,
      totalAmount,
      createdBy: user?.name || req.user.email,
    });

    emitChange('purchaseOrder');
    res.status(201).json(po);
  } catch (err) {
    req.log.error({ err }, 'Error creating purchase order');
    res.status(500).json({ error: 'Failed to create purchase order' });
  }
}

export async function updatePurchaseOrderStatus(req, res) {
  const { restaurantId, locationId } = req;
  const { status: nextStatus } = req.body;

  const session = await mongoose.startSession();
  try {
    let updatedPo;

    await session.withTransaction(async () => {
      const po = await PurchaseOrder.findOne({ _id: req.params.id, restaurantId, locationId }).session(session);
      if (!po) {
        throw Object.assign(new Error('Purchase order not found'), { status: 404 });
      }

      const allowedNext = ALLOWED_TRANSITIONS[po.status] || [];
      if (!allowedNext.includes(nextStatus)) {
        throw Object.assign(
          new Error(`Cannot move a purchase order from "${po.status}" to "${nextStatus}".`),
          { status: 400 }
        );
      }

      if (nextStatus === 'received') {
        const user = await User.findById(req.user.id).select('name').session(session);
        const performedBy = user?.name || req.user.email;

        for (const item of po.items) {
          const invDoc = await Inventory.findOne({ _id: item.inventoryItemId, restaurantId }).session(session);
          if (!invDoc) continue; // ingredient may have been deleted since the PO was created

          await Stock.findOneAndUpdate(
            { restaurantId, locationId: po.locationId, inventoryItemId: invDoc._id },
            { $inc: { totalQuantity: item.quantity } },
            { upsert: true, session }
          );

          await StockHistory.create(
            [
              {
                restaurantId,
                locationId: po.locationId,
                itemId: invDoc._id,
                itemName: invDoc.name,
                quantity: item.quantity,
                unit: invDoc.unit,
                performedBy,
                description: `Received via PO from ${po.vendorName}`,
              },
            ],
            { session }
          );
        }
        po.receivedAt = new Date();
      } else if (nextStatus === 'sent') {
        po.sentAt = new Date();
      } else if (nextStatus === 'reconciled') {
        po.reconciledAt = new Date();
      }

      po.status = nextStatus;
      await po.save({ session });
      updatedPo = po;
    });

    const currency = await getCurrencySymbol(restaurantId, locationId);
    const auditMessages = {
      sent: `sent purchase order to ${updatedPo.vendorName} (${currency} ${updatedPo.totalAmount.toLocaleString()})`,
      received: `received purchase order from ${updatedPo.vendorName} — ${currency} ${updatedPo.totalAmount.toLocaleString()}, added to inventory`,
      reconciled: `reconciled purchase order from ${updatedPo.vendorName}`,
    };
    await logAudit(restaurantId, req.user, auditMessages[updatedPo.status], locationId);

    emitChange('purchaseOrder');
    if (updatedPo.status === 'received') emitChange('inventory');
    res.json(updatedPo);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'Error updating purchase order status');
    res.status(status).json({ message: err.status ? err.message : 'Failed to update purchase order status.' });
  } finally {
    session.endSession();
  }
}

export async function deletePurchaseOrder(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const po = await PurchaseOrder.findOne({ _id: req.params.id, restaurantId, locationId });
    if (!po) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }
    if (po.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft purchase orders can be deleted.' });
    }
    await PurchaseOrder.deleteOne({ _id: po._id });
    emitChange('purchaseOrder');
    res.json({ message: 'Purchase order deleted successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting purchase order');
    res.status(500).json({ error: 'Failed to delete purchase order' });
  }
}
