import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { staffInviteSchema, staffRoleUpdateSchema } from '../validators.js';
import { listStaff, inviteStaff, updateStaffRole, removeStaff } from '../controllers/staffController.js';

const router = Router();

router.get('/', listStaff);
router.post('/invite', requireRole('Owner'), validate(staffInviteSchema), inviteStaff);
router.patch('/:id/role', requireRole('Owner'), validate(staffRoleUpdateSchema), updateStaffRole);
router.delete('/:id', requireRole('Owner'), removeStaff);

export default router;
