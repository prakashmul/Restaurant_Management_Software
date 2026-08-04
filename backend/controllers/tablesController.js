import Table from '../models/Table.js';
import Order from '../models/Order.js';
import { emitChange } from '../realtime/socket.js';

export async function listTables(req, res) {
  try {
    const tables = await Table.find();
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
}

export async function createTable(req, res) {
  try {
    const newTable = new Table({
      number: req.body.number,
      status: 'available',
      seats: req.body.seats,
    });
    await newTable.save();
    emitChange('table');
    res.status(201).json(newTable);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create table' });
  }
}

export async function updateTable(req, res) {
  try {
    const updatedTable = await Table.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (updatedTable) {
      emitChange('table');
      res.json(updatedTable);
    } else {
      res.status(404).json({ message: 'Table not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update table' });
  }
}

export async function deleteTable(req, res) {
  try {
    const activeOrder = await Order.exists({ tableId: req.params.id, status: 'pending' });
    if (activeOrder) {
      return res.status(400).json({
        message: 'Cannot delete this table because it has an active pending order. Cancel or settle it first.',
      });
    }

    const deleted = await Table.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Table not found' });
    }
    emitChange('table');
    res.json({ message: 'Table deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete table' });
  }
}
