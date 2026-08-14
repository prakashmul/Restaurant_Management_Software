import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { createLocationSchema, updateLocationSchema, updateLocationGeofenceSchema } from '../validators.js';
import {
  listLocations,
  createLocation,
  updateLocation,
  updateLocationGeofence,
  deleteLocation,
} from '../controllers/locationsController.js';

const router = Router();

router.get('/', listLocations);
router.post('/', requirePermission('locations.manage'), validate(createLocationSchema), createLocation);
router.patch('/:id', requirePermission('locations.manage'), validate(updateLocationSchema), updateLocation);
router.patch(
  '/:id/geofence',
  requirePermission('locations.geofence'),
  validate(updateLocationGeofenceSchema),
  updateLocationGeofence
);
router.delete('/:id', requirePermission('locations.manage'), deleteLocation);

export default router;
