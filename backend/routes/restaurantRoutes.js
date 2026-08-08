import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { updateRestaurantSchema } from '../validators.js';
import { getRestaurant, updateRestaurant } from '../controllers/restaurantController.js';

const router = Router();

router.get('/', getRestaurant);
router.patch('/', requirePermission('settings.restaurant'), validate(updateRestaurantSchema), updateRestaurant);

export default router;
