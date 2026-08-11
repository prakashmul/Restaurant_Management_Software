import Expense from '../models/Expense.js';
import { logAudit } from '../services/auditService.js';
import { getCurrencySymbol } from '../utils/currency.js';
import { emitChange } from '../realtime/socket.js';
import { rangeStart, rangeEnd } from '../utils/dateRange.js';

const EXPENSE_CATEGORY_LABELS = {
  staff_salary: 'staff salary',
  rent: 'rent',
  electricity: 'electricity',
  water: 'water',
  miscellaneous: 'miscellaneous',
  other: 'other',
};

export async function listExpenses(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { startDate, endDate } = req.query;

    const query = { restaurantId };
    if (locationId) query.locationId = locationId;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = rangeStart(startDate);
      if (endDate) query.date.$lte = rangeEnd(endDate);
    }

    const expenses = await Expense.find(query).sort({ date: -1 });
    res.json(expenses);
  } catch (err) {
    req.log.error({ err }, 'Error fetching expenses');
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
}

export async function createExpense(req, res) {
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const { category, amount, date, note } = req.body;

    const expense = await Expense.create({
      restaurantId,
      locationId,
      category,
      amount,
      date: new Date(date),
      note: note || '',
      createdBy: req.user.name || req.user.email,
    });

    const currency = await getCurrencySymbol(restaurantId, locationId);
    await logAudit(
      restaurantId,
      req.user,
      `logged a ${currency} ${amount.toLocaleString()} ${EXPENSE_CATEGORY_LABELS[category]} expense`,
      locationId
    );

    emitChange('expense');
    res.status(201).json(expense);
  } catch (err) {
    req.log.error({ err }, 'Error creating expense');
    res.status(500).json({ error: 'Failed to create expense' });
  }
}

export async function updateExpense(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { category, amount, date, note } = req.body;

    const expense = await Expense.findOne({ _id: req.params.id, restaurantId, ...(locationId ? { locationId } : {}) });
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    if (category !== undefined) expense.category = category;
    if (amount !== undefined) expense.amount = amount;
    if (date !== undefined) expense.date = new Date(date);
    if (note !== undefined) expense.note = note;
    await expense.save();

    await logAudit(restaurantId, req.user, `updated an expense entry`, locationId);

    emitChange('expense');
    res.json(expense);
  } catch (err) {
    req.log.error({ err }, 'Error updating expense');
    res.status(500).json({ error: 'Failed to update expense' });
  }
}

export async function deleteExpense(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      restaurantId,
      ...(locationId ? { locationId } : {}),
    });
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const currency = await getCurrencySymbol(restaurantId, locationId);
    await logAudit(
      restaurantId,
      req.user,
      `deleted a ${currency} ${expense.amount.toLocaleString()} ${EXPENSE_CATEGORY_LABELS[expense.category]} expense`,
      locationId
    );

    emitChange('expense');
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting expense');
    res.status(500).json({ error: 'Failed to delete expense' });
  }
}
