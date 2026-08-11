import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { createExpenseSchema, updateExpenseSchema } from '../validators.js';
import { listExpenses, createExpense, updateExpense, deleteExpense } from '../controllers/expensesController.js';

const router = Router();

router.get('/', requirePermission('expenses.view'), listExpenses);
router.post('/', requirePermission('expenses.manage'), validate(createExpenseSchema), createExpense);
router.patch('/:id', requirePermission('expenses.manage'), validate(updateExpenseSchema), updateExpense);
router.delete('/:id', requirePermission('expenses.manage'), deleteExpense);

export default router;
