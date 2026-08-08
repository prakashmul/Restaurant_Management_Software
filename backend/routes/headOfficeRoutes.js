import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
import { getSummary } from '../controllers/headOfficeController.js';

const router = Router();

router.get('/summary', requirePermission('settings.headoffice'), getSummary);

export default router;
