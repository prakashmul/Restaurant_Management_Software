import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requirePlatformAdmin } from '../middleware/platformAdminAuth.js';
import { validate } from '../middleware/validate.js';
import { createPlanSchema, updatePlanSchema, assignRestaurantPlanSchema } from '../validators.js';
import {
  getMe,
  getPageCatalog,
  listRestaurants,
  updateRestaurantPages,
  deleteRestaurant,
  listAdmins,
  inviteAdmin,
  acceptInvite,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
  assignRestaurantPlan,
  resetRestaurantPlanDefaults,
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
router.patch('/restaurants/:id/plan', validate(assignRestaurantPlanSchema), assignRestaurantPlan);
router.patch('/restaurants/:id/plan/reset', resetRestaurantPlanDefaults);
router.delete('/restaurants/:id', deleteRestaurant);
router.get('/plans', listPlans);
router.post('/plans', validate(createPlanSchema), createPlan);
router.put('/plans/:id', validate(updatePlanSchema), updatePlan);
router.delete('/plans/:id', deletePlan);
router.get('/admins', listAdmins);
router.post('/admins/invite', inviteAdmin);

export default router;
