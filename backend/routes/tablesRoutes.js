import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { createTableSchema, updateTableSchema } from '../validators.js';
import { listTables, createTable, updateTable, deleteTable } from '../controllers/tablesController.js';

const router = Router();

router.get('/', requirePermission('tables'), listTables);
router.post('/', requirePermission('tables'), validate(createTableSchema), createTable);
router.put('/:id', requirePermission('tables'), validate(updateTableSchema), updateTable);
router.delete('/:id', requirePermission('tables'), deleteTable);

export default router;
