import { Router } from 'express';
import { getCreditLedger } from '../controllers/creditsController.js';

const router = Router();

router.get('/', getCreditLedger);

export default router;
