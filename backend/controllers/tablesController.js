import Table from '../models/Table.js';
import Order from '../models/Order.js';
import { emitChange } from '../realtime/socket.js';
import { logAudit } from '../services/auditService.js';

export async function listTables(req, res) {
  try {
    const query = { restaurantId: req.restaurantId };
    if (req.locationId) query.locationId = req.locationId;
    const tables = await Table.find(query);
    res.json(tables);
  } catch (err) {
    req.log.error({ err }, 'Error fetching tables');
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
}

export async function createTable(req, res) {
  try {
    if (!req.locationId) {
      return res.status(400).json({ message: 'Select a location before adding a table.' });
    }
    const newTable = new Table({
      restaurantId: req.restaurantId,
      locationId: req.locationId,
      number: req.body.number,
      status: 'available',
      seats: req.body.seats,
    });
    await newTable.save();
    emitChange('table');
    res.status(201).json(newTable);
  } catch (err) {
    req.log.error({ err }, 'Error creating table');
    res.status(500).json({ error: 'Failed to create table' });
  }
}

export async function updateTable(req, res) {
  try {
    const updatedTable = await Table.findOneAndUpdate(
      { _id: req.params.id, restaurantId: req.restaurantId, locationId: req.locationId },
      req.body,
      { returnDocument: 'after' }
    );
    if (updatedTable) {
      emitChange('table');
      res.json(updatedTable);
    } else {
      res.status(404).json({ message: 'Table not found' });
    }
  } catch (err) {
    req.log.error({ err }, 'Error updating table');
    res.status(500).json({ error: 'Failed to update table' });
  }
}

export async function deleteTable(req, res) {
  try {
    const activeOrder = await Order.exists({
      restaurantId: req.restaurantId,
      tableId: req.params.id,
      status: 'pending',
    });
    if (activeOrder) {
      return res.status(400).json({
        message: 'Cannot delete this table because it has an active pending order. Cancel or settle it first.',
      });
    }

    const deleted = await Table.findOneAndDelete({
      _id: req.params.id,
      restaurantId: req.restaurantId,
      locationId: req.locationId,
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Table not found' });
    }
    await logAudit(req.restaurantId, req.user, `deleted Table #${deleted.number}`, req.locationId);
    emitChange('table');
    res.json({ message: 'Table deleted successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting table');
    res.status(500).json({ error: 'Failed to delete table' });
  }
}
