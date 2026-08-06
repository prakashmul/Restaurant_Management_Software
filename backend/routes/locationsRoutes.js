import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { createLocationSchema, updateLocationSchema } from '../validators.js';
import { listLocations, createLocation, updateLocation, deleteLocation } from '../controllers/locationsController.js';

const router = Router();

router.get('/', listLocations);
router.post('/', requireRole('Owner'), validate(createLocationSchema), createLocation);
router.patch('/:id', requireRole('Owner'), validate(updateLocationSchema), updateLocation);
router.delete('/:id', requireRole('Owner'), deleteLocation);

export default router;
