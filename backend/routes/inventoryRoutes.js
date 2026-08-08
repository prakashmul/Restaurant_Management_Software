import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { inventoryItemSchema, restockSchema, updateInventoryItemSchema, logWasteSchema } from '../validators.js';
import {
  listInventory,
  createInventoryItem,
  restockInventoryItem,
  updateInventoryItem,
  listStockHistory,
  logWaste,
  getPriceHistory,
} from '../controllers/inventoryController.js';

const router = Router();

router.get('/', requirePermission('stock.view'), listInventory);
router.post('/', requirePermission('stock.edit'), validate(inventoryItemSchema), createInventoryItem);
router.patch('/:id/restock', requirePermission('stock.edit'), validate(restockSchema), restockInventoryItem);
router.patch('/:id/waste', requirePermission('stock.edit'), validate(logWasteSchema), logWaste);
router.patch('/:id', requirePermission('stock.edit'), validate(updateInventoryItemSchema), updateInventoryItem);
router.get('/history', requirePermission('stock.history'), listStockHistory);
router.get('/:id/price-history', requirePermission('stock.history'), getPriceHistory);

export default router;
