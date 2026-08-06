import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { createTransferSchema } from '../validators.js';
import { listTransfers, createTransfer, receiveTransfer, cancelTransfer } from '../controllers/transfersController.js';

const router = Router();

router.get('/', listTransfers);
router.post('/', requireRole('Owner', 'Manager'), validate(createTransferSchema), createTransfer);
router.patch('/:id/receive', requireRole('Owner', 'Manager'), receiveTransfer);
router.patch('/:id/cancel', requireRole('Owner', 'Manager'), cancelTransfer);

export default router;
