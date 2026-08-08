import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { menuItemSchema } from '../validators.js';
import { listMenu, createMenuItem, deleteMenuItem } from '../controllers/menuController.js';

const router = Router();

router.get('/', requirePermission('menu.view'), listMenu);
router.post('/', requirePermission('menu.edit'), validate(menuItemSchema), createMenuItem);
router.delete('/:id', requirePermission('menu.edit'), deleteMenuItem);

export default router;
