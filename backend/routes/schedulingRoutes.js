import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { createShiftSchema } from '../validators.js';
import { listShifts, createShift, deleteShift, getVariance } from '../controllers/schedulingController.js';

const router = Router();

router.get('/shifts', listShifts);
router.post('/shifts', requireRole('Owner', 'Manager'), validate(createShiftSchema), createShift);
router.delete('/shifts/:id', requireRole('Owner', 'Manager'), deleteShift);
router.get('/variance', requireRole('Owner', 'Manager'), getVariance);

export default router;
