import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { categorySchema } from '../validators.js';
import { listCategories, createCategory, deleteCategory } from '../controllers/categoriesController.js';

const router = Router();

router.get('/', listCategories);
router.post('/', validate(categorySchema), createCategory);
router.delete('/:id', deleteCategory);

export default router;
