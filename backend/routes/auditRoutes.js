import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
import { listAuditLog } from '../controllers/auditController.js';

const router = Router();

router.get('/', requirePermission('audit.view'), listAuditLog);

export default router;
