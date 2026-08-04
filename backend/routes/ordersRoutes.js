import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { idempotent } from '../middleware/idempotency.js';
import {
  saveOrderSchema,
  payOrderSchema,
  creditOrderSchema,
  partialCreditPaySchema,
  fullSettleSchema,
} from '../validators.js';
import {
  listOrders,
  saveOrder,
  payOrder,
  creditOrder,
  cancelTableOrder,
  deleteOrder,
} from '../controllers/ordersController.js';
import { partialCreditPay, fullSettleCredit } from '../controllers/creditsController.js';

const router = Router();

router.get('/', listOrders);
router.post('/save', validate(saveOrderSchema), saveOrder);
router.post('/:orderId/pay', idempotent, validate(payOrderSchema), payOrder);
router.post('/:orderId/credit', idempotent, validate(creditOrderSchema), creditOrder);
router.post('/credit/partial-pay', validate(partialCreditPaySchema), partialCreditPay);
router.post('/credit/full-settle', validate(fullSettleSchema), fullSettleCredit);
router.delete('/table/:tableId', cancelTableOrder);
router.delete('/:id', deleteOrder);

export default router;
