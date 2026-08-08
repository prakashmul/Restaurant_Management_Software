import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { categorySchema } from '../validators.js';
import { listCategories, createCategory, deleteCategory } from '../controllers/categoriesController.js';

const router = Router();

router.get('/', requirePermission('menu.view'), listCategories);
router.post('/', requirePermission('menu.edit'), validate(categorySchema), createCategory);
router.delete('/:id', requirePermission('menu.edit'), deleteCategory);

export default router;
