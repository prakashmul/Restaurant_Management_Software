import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { staffInviteSchema, staffRoleUpdateSchema, staffRateUpdateSchema } from '../validators.js';
import {
  listStaff,
  inviteStaff,
  updateStaffRole,
  updateStaffRate,
  removeStaff,
  exportPayrollCsv,
} from '../controllers/staffController.js';

const router = Router();

router.get('/payroll/export', requirePermission('settings.staff'), exportPayrollCsv);
router.get('/', requirePermission('staff.view'), listStaff);
router.post('/invite', requirePermission('settings.staff'), validate(staffInviteSchema), inviteStaff);
router.patch('/:id/role', requirePermission('settings.staff'), validate(staffRoleUpdateSchema), updateStaffRole);
router.patch('/:id/rate', requirePermission('settings.staff'), validate(staffRateUpdateSchema), updateStaffRate);
router.delete('/:id', requirePermission('settings.staff'), removeStaff);

export default router;
