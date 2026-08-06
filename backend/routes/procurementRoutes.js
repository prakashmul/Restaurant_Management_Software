import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { createVendorSchema, createPurchaseOrderSchema, updatePurchaseOrderStatusSchema } from '../validators.js';
import {
  listVendors,
  createVendor,
  deleteVendor,
  listPurchaseOrders,
  createPurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
} from '../controllers/procurementController.js';

const router = Router();

router.get('/vendors', listVendors);
router.post('/vendors', requireRole('Owner', 'Manager'), validate(createVendorSchema), createVendor);
router.delete('/vendors/:id', requireRole('Owner', 'Manager'), deleteVendor);

router.get('/purchase-orders', listPurchaseOrders);
router.post(
  '/purchase-orders',
  requireRole('Owner', 'Manager'),
  validate(createPurchaseOrderSchema),
  createPurchaseOrder
);
router.patch(
  '/purchase-orders/:id/status',
  requireRole('Owner', 'Manager'),
  validate(updatePurchaseOrderStatusSchema),
  updatePurchaseOrderStatus
);
router.delete('/purchase-orders/:id', requireRole('Owner', 'Manager'), deletePurchaseOrder);

export default router;
