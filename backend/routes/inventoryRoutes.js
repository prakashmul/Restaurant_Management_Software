import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { inventoryItemSchema, restockSchema } from '../validators.js';
import {
  listInventory,
  createInventoryItem,
  restockInventoryItem,
  listStockHistory,
} from '../controllers/inventoryController.js';

const router = Router();

router.get('/', listInventory);
router.post('/', validate(inventoryItemSchema), createInventoryItem);
router.patch('/:id/restock', validate(restockSchema), restockInventoryItem);
// Owner only — matches the existing frontend gate.
router.get('/history', requireRole('Owner'), listStockHistory);

export default router;
