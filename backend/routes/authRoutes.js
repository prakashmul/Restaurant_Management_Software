import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { registerSchema, loginSchema, totpTokenSchema } from '../validators.js';
import {
  register,
  login,
  getTotpStatus,
  setupTotp,
  enableTotp,
  disableTotp,
} from '../controllers/authController.js';

// Tighter limit on auth routes specifically, to blunt password-guessing attempts.
// Raised in the test env only — a single test file legitimately registers/logs
// in many fixture accounts back-to-back from the same "IP" (supertest), which
// this limiter's real-world threat model (one attacker hammering one account)
// never produces.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);

router.get('/2fa/status', requireAuth, getTotpStatus);
router.post('/2fa/setup', requireAuth, setupTotp);
router.post('/2fa/enable', requireAuth, validate(totpTokenSchema), enableTotp);
router.post('/2fa/disable', requireAuth, validate(totpTokenSchema), disableTotp);

export default router;
