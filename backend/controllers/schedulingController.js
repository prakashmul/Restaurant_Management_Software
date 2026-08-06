import Shift from '../models/Shift.js';
import StaffMembership from '../models/StaffMembership.js';
import Attendance from '../models/Attendance.js';
import { emitChange } from '../realtime/socket.js';

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function durationToSeconds(duration) {
  if (!duration) return 0;
  const [h = 0, m = 0, s = 0] = duration.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

export async function listShifts(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { start, end } = req.query;
    const query = { restaurantId };
    if (locationId) query.locationId = locationId;
    if (start && end) query.date = { $gte: start, $lte: end };

    const shifts = await Shift.find(query).sort({ date: 1, startTime: 1 });
    res.json(shifts);
  } catch (err) {
    req.log.error({ err }, 'Error fetching shifts');
    res.status(500).json({ error: 'Failed to fetch shifts' });
  }
}

export async function createShift(req, res) {
  try {
    const { restaurantId, locationId } = req;
    if (!locationId) {
      return res.status(400).json({ message: 'Select a location first' });
    }
    const { staffMembershipId, date, startTime, endTime } = req.body;

    const membership = await StaffMembership.findOne({ _id: staffMembershipId, restaurantId }).populate(
      'userId',
      'name'
    );
    if (!membership) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    const shift = await Shift.create({
      restaurantId,
      locationId,
      staffMembershipId,
      staffName: membership.userId.name,
      role: membership.role,
      date,
      startTime,
      endTime,
    });

    emitChange('shift');
    res.status(201).json(shift);
  } catch (err) {
    req.log.error({ err }, 'Error creating shift');
    res.status(500).json({ error: 'Failed to create shift' });
  }
}

export async function deleteShift(req, res) {
  try {
    const deleted = await Shift.findOneAndDelete({
      _id: req.params.id,
      restaurantId: req.restaurantId,
      locationId: req.locationId,
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Shift not found' });
    }
    emitChange('shift');
    res.json({ message: 'Shift deleted successfully' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting shift');
    res.status(500).json({ error: 'Failed to delete shift' });
  }
}

// Compares planned shift hours against actual clocked hours for each staff
// member over a date range. Joined by name rather than staff-member id,
// since Attendance predates this feature and only ever recorded a free-text
// employee name (see Shift.js for the same reasoning on staffName).
export async function getVariance(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ message: 'start and end query params are required (YYYY-MM-DD).' });
    }

    const locationFilter = locationId ? { locationId } : {};
    const [shifts, attendanceRecords] = await Promise.all([
      Shift.find({ restaurantId, ...locationFilter, date: { $gte: start, $lte: end } }),
      // start/end are plain YYYY-MM-DD calendar dates (see the callers, which
      // derive them from toISOString().slice(0, 10)) — parsed with an
      // explicit Z so the boundary is UTC midnight, not the server's local
      // timezone. Without it, a server running ahead of UTC (e.g. UTC+5:45)
      // could exclude attendance logged "today" because local midnight for
      // that date string lands after the record's actual UTC timestamp.
      Attendance.find({
        restaurantId,
        ...locationFilter,
        createdAt: { $gte: new Date(`${start}T00:00:00Z`), $lte: new Date(`${end}T23:59:59.999Z`) },
      }),
    ]);

    const plannedByName = new Map();
    for (const shift of shifts) {
      const minutes = timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime);
      plannedByName.set(shift.staffName, (plannedByName.get(shift.staffName) || 0) + minutes * 60);
    }

    const actualByName = new Map();
    for (const record of attendanceRecords) {
      actualByName.set(
        record.employeeName,
        (actualByName.get(record.employeeName) || 0) + durationToSeconds(record.duration)
      );
    }

    const names = new Set([...plannedByName.keys(), ...actualByName.keys()]);
    const perStaff = [...names]
      .map((name) => ({
        name,
        plannedSeconds: plannedByName.get(name) || 0,
        actualSeconds: actualByName.get(name) || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalPlannedSeconds = perStaff.reduce((sum, p) => sum + p.plannedSeconds, 0);
    const totalActualSeconds = perStaff.reduce((sum, p) => sum + p.actualSeconds, 0);

    res.json({
      start,
      end,
      totalPlannedSeconds,
      totalActualSeconds,
      variancePercent:
        totalPlannedSeconds > 0 ? ((totalActualSeconds - totalPlannedSeconds) / totalPlannedSeconds) * 100 : null,
      perStaff,
    });
  } catch (err) {
    req.log.error({ err }, 'Error computing schedule variance');
    res.status(500).json({ error: 'Failed to compute schedule variance' });
  }
}
