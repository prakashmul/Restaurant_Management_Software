import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { updateCustomerSchema } from '../validators.js';
import { listCustomers, getCustomer, updateCustomer } from '../controllers/customersController.js';

const router = Router();

router.get('/', requirePermission('customers'), listCustomers);
router.get('/:id', requirePermission('customers'), getCustomer);
router.patch('/:id', requirePermission('customers'), validate(updateCustomerSchema), updateCustomer);

export default router;
