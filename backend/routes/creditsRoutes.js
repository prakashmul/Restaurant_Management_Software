import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
import { getCreditLedger } from '../controllers/creditsController.js';

const router = Router();

router.get('/', requirePermission('credit.view'), getCreditLedger);

export default router;
