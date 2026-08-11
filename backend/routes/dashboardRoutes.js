import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
import { getDashboardSummary } from '../controllers/dashboardController.js';

const router = Router();

router.get('/summary', requirePermission('dash'), getDashboardSummary);

export default router;
