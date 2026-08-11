import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { createRoleSchema, updateRoleSchema } from '../validators.js';
import { listRoles, createRole, updateRole, deleteRole, getPermissionCatalog, getMyPermissions } from '../controllers/rolesController.js';

const router = Router();

// No requirePermission — every authenticated user can always see their own
// permission list, regardless of role. Must come before the staff.view-gated
// routes below since listRoles/staff.view is admin-only (full org role data).
router.get('/mine', getMyPermissions);
router.get('/permissions', requirePermission('staff.view'), getPermissionCatalog);
router.get('/', requirePermission('staff.view'), listRoles);
router.post('/', requirePermission('settings.roles'), validate(createRoleSchema), createRole);
router.patch('/:id', requirePermission('settings.roles'), validate(updateRoleSchema), updateRole);
router.delete('/:id', requirePermission('settings.roles'), deleteRole);

export default router;
