import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { checklistTemplateSchema } from '../validators.js';
import {
  listTemplates,
  createTemplate,
  deleteTemplate,
  getToday,
  toggleItem,
} from '../controllers/checklistsController.js';

const router = Router();

router.get('/templates', listTemplates);
router.post('/templates', requireRole('Owner', 'Manager'), validate(checklistTemplateSchema), createTemplate);
router.delete('/templates/:id', requireRole('Owner', 'Manager'), deleteTemplate);
router.get('/today', getToday);
router.patch('/completions/:completionId/items/:itemIndex/toggle', toggleItem);

export default router;
