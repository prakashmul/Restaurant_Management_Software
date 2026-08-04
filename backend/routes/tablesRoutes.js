import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { createTableSchema, updateTableSchema } from '../validators.js';
import { listTables, createTable, updateTable, deleteTable } from '../controllers/tablesController.js';

const router = Router();

router.get('/', listTables);
router.post('/', validate(createTableSchema), createTable);
router.put('/:id', validate(updateTableSchema), updateTable);
router.delete('/:id', deleteTable);

export default router;
