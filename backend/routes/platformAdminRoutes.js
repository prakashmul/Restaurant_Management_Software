import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requirePlatformAdmin } from '../middleware/platformAdminAuth.js';
import {
  getMe,
  getPageCatalog,
  listRestaurants,
  updateRestaurantPages,
  listAdmins,
  inviteAdmin,
  acceptInvite,
} from '../controllers/platformAdminController.js';

// Same rationale as authRoutes.js's authLimiter — blunts guessing attempts
// against the public accept-invite token, relaxed in tests only.
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

const router = Router();

// Public — reached from the emailed invite link, no session yet.
router.post('/accept-invite', inviteLimiter, acceptInvite);

router.use(requirePlatformAdmin);

router.get('/me', getMe);
router.get('/page-catalog', getPageCatalog);
router.get('/restaurants', listRestaurants);
router.patch('/restaurants/:id/pages', updateRestaurantPages);
router.get('/admins', listAdmins);
router.post('/admins/invite', inviteAdmin);

export default router;
