import Attendance from '../models/Attendance.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';

export async function listAttendance(req, res) {
  try {
    const pagination = parsePagination(req);
    if (!pagination) {
      const records = await Attendance.find().sort({ createdAt: -1 });
      return res.json(records);
    }
    const [data, total] = await Promise.all([
      Attendance.find().sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
      Attendance.countDocuments(),
    ]);
    res.json(paginatedResponse(data, total, pagination));
  } catch (err) {
    req.log.error({ err }, 'Error fetching attendance history');
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
}

export async function createAttendance(req, res) {
  try {
    const { employeeName, checkInTime, checkOutTime, duration, status } = req.body;

    const newAttendance = new Attendance({ employeeName, checkInTime, checkOutTime, duration, status });
    await newAttendance.save();
    res.status(201).json(newAttendance);
  } catch (err) {
    req.log.error({ err }, 'Error saving attendance record');
    res.status(500).json({ error: 'Failed to save attendance record' });
  }
}
