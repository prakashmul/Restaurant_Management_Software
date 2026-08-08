import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { createTransferSchema } from '../validators.js';
import { listTransfers, createTransfer, receiveTransfer, cancelTransfer } from '../controllers/transfersController.js';

const router = Router();

router.get('/', requirePermission('transfers.view'), listTransfers);
router.post('/', requirePermission('transfers.manage'), validate(createTransferSchema), createTransfer);
router.patch('/:id/receive', requirePermission('transfers.manage'), receiveTransfer);
router.patch('/:id/cancel', requirePermission('transfers.manage'), cancelTransfer);

export default router;
