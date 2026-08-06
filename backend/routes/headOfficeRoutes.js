import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { getSummary } from '../controllers/headOfficeController.js';

const router = Router();

router.get('/summary', requireRole('Owner'), getSummary);

export default router;
