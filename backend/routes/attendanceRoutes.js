import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { attendanceSchema } from '../validators.js';
import { listAttendance, createAttendance } from '../controllers/attendanceController.js';

const router = Router();

router.get('/', listAttendance);
router.post('/', validate(attendanceSchema), createAttendance);

export default router;
