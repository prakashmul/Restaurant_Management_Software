import { Router } from 'express';
import { listActivePlans } from '../controllers/plansController.js';

const router = Router();

router.get('/', listActivePlans);

export default router;
