import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { createRoleSchema, updateRoleSchema } from '../validators.js';
import { listRoles, createRole, updateRole, deleteRole, getPermissionCatalog } from '../controllers/rolesController.js';

const router = Router();

router.get('/permissions', requirePermission('staff.view'), getPermissionCatalog);
router.get('/', requirePermission('staff.view'), listRoles);
router.post('/', requirePermission('settings.roles'), validate(createRoleSchema), createRole);
router.patch('/:id', requirePermission('settings.roles'), validate(updateRoleSchema), updateRole);
router.delete('/:id', requirePermission('settings.roles'), deleteRole);

export default router;
