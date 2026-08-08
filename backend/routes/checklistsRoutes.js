import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
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
router.post('/templates', requirePermission('checklists.manage'), validate(checklistTemplateSchema), createTemplate);
router.delete('/templates/:id', requirePermission('checklists.manage'), deleteTemplate);
// Today's checklist stays open to any authenticated staff member on purpose
// — daily prep work (checking it off) shouldn't depend on a role toggle.
router.get('/today', getToday);
router.patch('/completions/:completionId/items/:itemIndex/toggle', toggleItem);

export default router;
