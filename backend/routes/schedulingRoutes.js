import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { createShiftSchema } from '../validators.js';
import { listShifts, createShift, deleteShift, getVariance } from '../controllers/schedulingController.js';

const router = Router();

router.get('/shifts', requirePermission('scheduling.view'), listShifts);
router.post('/shifts', requirePermission('scheduling.manage'), validate(createShiftSchema), createShift);
router.delete('/shifts/:id', requirePermission('scheduling.manage'), deleteShift);
router.get('/variance', requirePermission('scheduling.manage'), getVariance);

export default router;
