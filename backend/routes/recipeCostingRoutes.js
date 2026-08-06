import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { getMenuEngineering } from '../controllers/recipeCostingController.js';

const router = Router();

router.get('/', requireRole('Owner'), getMenuEngineering);

export default router;
