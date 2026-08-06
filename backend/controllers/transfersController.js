import mongoose from 'mongoose';
import Transfer from '../models/Transfer.js';
import Location from '../models/Location.js';
import Inventory from '../models/Inventory.js';
import Stock from '../models/Stock.js';
import StockHistory from '../models/StockHistory.js';
import { emitChange } from '../realtime/socket.js';
import { logAudit } from '../services/auditService.js';

export async function listTransfers(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const query = { restaurantId };
    if (locationId) query.$or = [{ fromLocationId: locationId }, { toLocationId: locationId }];
    if (req.query.status) query.status = req.query.status;

    const transfers = await Transfer.find(query).sort({ createdAt: -1 });
    res.json(transfers);
  } catch (err) {
    req.log.error({ err }, 'Error fetching transfers');
    res.status(500).json({ error: 'Failed to fetch transfers' });
  }
}

export async function createTransfer(req, res) {
  const { restaurantId, locationId: fromLocationId } = req;
  if (!fromLocationId) {
    return res.status(400).json({ message: 'Select a location first' });
  }
  const { toLocationId, items } = req.body;

  if (toLocationId === fromLocationId) {
    return res.status(400).json({ message: 'Cannot transfer stock to the same location.' });
  }

  const session = await mongoose.startSession();
  try {
    let transfer;

    await session.withTransaction(async () => {
      const fromLocation = await Location.findOne({ _id: fromLocationId, restaurantId }).session(session);
      const toLocation = await Location.findOne({ _id: toLocationId, restaurantId }).session(session);
      if (!toLocation) {
        throw Object.assign(new Error('Destination location not found'), { status: 404 });
      }

      const inventoryIds = items.map((i) => i.inventoryItemId);
      const inventoryItems = await Inventory.find({ _id: { $in: inventoryIds }, restaurantId }).session(session);
      const inventoryById = new Map(inventoryItems.map((i) => [i._id.toString(), i]));

      const resolvedItems = [];
      for (const item of items) {
        const invItem = inventoryById.get(item.inventoryItemId);
        if (!invItem) {
          throw Object.assign(new Error(`Inventory item ${item.inventoryItemId} not found`), { status: 400 });
        }
        resolvedItems.push({ inventoryItemId: invItem._id, itemName: invItem.name, unit: invItem.unit, quantity: item.quantity });
      }

      for (const item of resolvedItems) {
        const updatedStock = await Stock.findOneAndUpdate(
          { restaurantId, locationId: fromLocationId, inventoryItemId: item.inventoryItemId, totalQuantity: { $gte: item.quantity } },
          { $inc: { totalQuantity: -item.quantity } },
          { returnDocument: 'after', session }
        );
        if (!updatedStock) {
          throw Object.assign(new Error(`Not enough stock of "${item.itemName}" at this location to transfer.`), {
            status: 409,
          });
        }

        await StockHistory.create(
          [
            {
              restaurantId,
              locationId: fromLocationId,
              itemId: item.inventoryItemId,
              itemName: item.itemName,
              quantity: -item.quantity,
              unit: item.unit,
              performedBy: req.user.email,
              description: `Transferred to ${toLocation.name}`,
            },
          ],
          { session }
        );
      }

      const created = await Transfer.create(
        [
          {
            restaurantId,
            fromLocationId,
            toLocationId,
            fromLocationName: fromLocation.name,
            toLocationName: toLocation.name,
            items: resolvedItems,
            status: 'in_transit',
            requestedBy: req.user.email,
          },
        ],
        { session }
      );
      transfer = created[0];
    });

    await logAudit(restaurantId, req.user, `sent a stock transfer to ${transfer.toLocationName}`, fromLocationId);

    emitChange('inventory');
    emitChange('transfer');
    res.status(201).json(transfer);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'Error creating transfer');
    res.status(status).json({ message: err.status ? err.message : 'Failed to create transfer.' });
  } finally {
    session.endSession();
  }
}

export async function receiveTransfer(req, res) {
  const { restaurantId, locationId } = req;
  if (!locationId) {
    return res.status(400).json({ message: 'Select a location first' });
  }

  const session = await mongoose.startSession();
  try {
    let transfer;

    await session.withTransaction(async () => {
      const found = await Transfer.findOne({
        _id: req.params.id,
        restaurantId,
        toLocationId: locationId,
        status: 'in_transit',
      }).session(session);
      if (!found) {
        throw Object.assign(new Error('Transfer not found or already resolved'), { status: 404 });
      }

      for (const item of found.items) {
        await Stock.findOneAndUpdate(
          { restaurantId, locationId, inventoryItemId: item.inventoryItemId },
          { $inc: { totalQuantity: item.quantity } },
          { upsert: true, session }
        );

        await StockHistory.create(
          [
            {
              restaurantId,
              locationId,
              itemId: item.inventoryItemId,
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              performedBy: req.user.email,
              description: `Received transfer from ${found.fromLocationName}`,
            },
          ],
          { session }
        );
      }

      found.status = 'received';
      found.receivedAt = new Date();
      await found.save({ session });
      transfer = found;
    });

    await logAudit(restaurantId, req.user, `received a stock transfer from ${transfer.fromLocationName}`, locationId);

    emitChange('inventory');
    emitChange('transfer');
    res.json(transfer);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'Error receiving transfer');
    res.status(status).json({ message: err.status ? err.message : 'Failed to receive transfer.' });
  } finally {
    session.endSession();
  }
}

export async function cancelTransfer(req, res) {
  const { restaurantId, locationId } = req;
  if (!locationId) {
    return res.status(400).json({ message: 'Select a location first' });
  }

  const session = await mongoose.startSession();
  try {
    let transfer;

    await session.withTransaction(async () => {
      const found = await Transfer.findOne({
        _id: req.params.id,
        restaurantId,
        fromLocationId: locationId,
        status: 'in_transit',
      }).session(session);
      if (!found) {
        throw Object.assign(new Error('Transfer not found or already resolved'), { status: 404 });
      }

      for (const item of found.items) {
        await Stock.findOneAndUpdate(
          { restaurantId, locationId, inventoryItemId: item.inventoryItemId },
          { $inc: { totalQuantity: item.quantity } },
          { upsert: true, session }
        );

        await StockHistory.create(
          [
            {
              restaurantId,
              locationId,
              itemId: item.inventoryItemId,
              itemName: item.itemName,
              quantity: item.quantity,
              unit: item.unit,
              performedBy: req.user.email,
              description: `Cancelled transfer to ${found.toLocationName} — stock refunded`,
            },
          ],
          { session }
        );
      }

      found.status = 'cancelled';
      found.cancelledAt = new Date();
      await found.save({ session });
      transfer = found;
    });

    await logAudit(restaurantId, req.user, `cancelled a stock transfer to ${transfer.toLocationName}`, locationId);

    emitChange('inventory');
    emitChange('transfer');
    res.json(transfer);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'Error cancelling transfer');
    res.status(status).json({ message: err.status ? err.message : 'Failed to cancel transfer.' });
  } finally {
    session.endSession();
  }
}
