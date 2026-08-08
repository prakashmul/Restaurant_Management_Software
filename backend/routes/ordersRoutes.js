import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { idempotent } from '../middleware/idempotency.js';
import { requirePermission } from '../middleware/auth.js';
import {
  saveOrderSchema,
  payOrderSchema,
  creditOrderSchema,
  partialCreditPaySchema,
  fullSettleSchema,
  applyDiscountSchema,
  applyTipSchema,
  refundOrderSchema,
  attachOrderCustomerSchema,
  redeemPointsSchema,
} from '../validators.js';
import {
  listOrders,
  saveOrder,
  payOrder,
  creditOrder,
  cancelTableOrder,
  deleteOrder,
  applyDiscount,
  applyTip,
  refundOrder,
  getKitchenOrders,
  bumpOrderItem,
  attachOrderCustomer,
  redeemLoyaltyPoints,
  exportOrdersCsv,
} from '../controllers/ordersController.js';
import { partialCreditPay, fullSettleCredit } from '../controllers/creditsController.js';

const router = Router();

router.get('/', requirePermission('orders.view'), listOrders);
router.get('/kitchen', requirePermission('orders.view'), getKitchenOrders);
router.get('/export/csv', requirePermission('settings.restaurant'), exportOrdersCsv);
router.post('/save', requirePermission('orders.edit'), validate(saveOrderSchema), saveOrder);
router.post('/:orderId/pay', requirePermission('orders.checkout'), idempotent, validate(payOrderSchema), payOrder);
router.post('/:orderId/credit', requirePermission('orders.credit'), idempotent, validate(creditOrderSchema), creditOrder);
router.post('/credit/partial-pay', requirePermission('credit.settle'), validate(partialCreditPaySchema), partialCreditPay);
router.post('/credit/full-settle', requirePermission('credit.settle'), validate(fullSettleSchema), fullSettleCredit);
router.patch('/:id/discount', requirePermission('orders.discount'), validate(applyDiscountSchema), applyDiscount);
router.patch('/:id/tip', requirePermission('orders.tip'), validate(applyTipSchema), applyTip);
router.patch('/:id/refund', requirePermission('orders.refund'), validate(refundOrderSchema), refundOrder);
router.patch('/:orderId/items/:itemId/bump', requirePermission('orders.view'), bumpOrderItem);
router.patch('/:id/customer', requirePermission('orders.checkout'), validate(attachOrderCustomerSchema), attachOrderCustomer);
router.patch('/:id/redeem-points', requirePermission('orders.discount'), validate(redeemPointsSchema), redeemLoyaltyPoints);
router.delete('/table/:tableId', requirePermission('orders.void'), cancelTableOrder);
router.delete('/:id', requirePermission('orders.void'), deleteOrder);

export default router;
