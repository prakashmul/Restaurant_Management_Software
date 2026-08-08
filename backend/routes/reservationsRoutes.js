import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { createReservationSchema, addToWaitlistSchema, updateReservationStatusSchema } from '../validators.js';
import {
  listReservations,
  createReservation,
  addToWaitlist,
  updateReservationStatus,
  deleteReservation,
} from '../controllers/reservationsController.js';

const router = Router();

router.get('/', requirePermission('reservations.view'), listReservations);
router.post('/', requirePermission('reservations.manage'), validate(createReservationSchema), createReservation);
router.post('/waitlist', requirePermission('reservations.manage'), validate(addToWaitlistSchema), addToWaitlist);
router.patch('/:id/status', requirePermission('reservations.manage'), validate(updateReservationStatusSchema), updateReservationStatus);
router.delete('/:id', requirePermission('reservations.manage'), deleteReservation);

export default router;
