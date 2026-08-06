import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { listAuditLog } from '../controllers/auditController.js';

const router = Router();

router.get('/', requireRole('Owner'), listAuditLog);

export default router;
