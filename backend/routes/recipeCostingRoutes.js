import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
import { getMenuEngineering } from '../controllers/recipeCostingController.js';

const router = Router();

router.get('/', requirePermission('recipecosting.view'), getMenuEngineering);

export default router;
