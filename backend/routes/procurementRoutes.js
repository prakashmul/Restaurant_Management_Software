import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { createVendorSchema, createPurchaseOrderSchema, updatePurchaseOrderStatusSchema } from '../validators.js';
import {
  listVendors,
  createVendor,
  deleteVendor,
  listPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
  getSuggestedOrders,
} from '../controllers/procurementController.js';

const router = Router();

router.get('/suggested-orders', requirePermission('procurement.view'), getSuggestedOrders);
router.get('/vendors', requirePermission('procurement.view'), listVendors);
router.post('/vendors', requirePermission('procurement.manage'), validate(createVendorSchema), createVendor);
router.delete('/vendors/:id', requirePermission('procurement.manage'), deleteVendor);

router.get('/purchase-orders', requirePermission('procurement.view'), listPurchaseOrders);
router.post(
  '/purchase-orders',
  requirePermission('procurement.manage'),
  validate(createPurchaseOrderSchema),
  createPurchaseOrder
);
router.patch(
  '/purchase-orders/:id/status',
  requirePermission('procurement.manage'),
  validate(updatePurchaseOrderStatusSchema),
  updatePurchaseOrderStatus
);
router.delete('/purchase-orders/:id', requirePermission('procurement.manage'), deletePurchaseOrder);

export default router;
