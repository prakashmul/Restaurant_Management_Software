import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { menuItemSchema } from '../validators.js';
import { listMenu, createMenuItem, deleteMenuItem } from '../controllers/menuController.js';

const router = Router();

router.get('/', listMenu);
router.post('/', validate(menuItemSchema), createMenuItem);
router.delete('/:id', deleteMenuItem);

export default router;
