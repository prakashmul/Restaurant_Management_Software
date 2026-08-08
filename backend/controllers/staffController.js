import crypto from 'node:crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import StaffMembership from '../models/StaffMembership.js';
import Location from '../models/Location.js';
import Role from '../models/Role.js';
import Attendance from '../models/Attendance.js';
import { logAudit } from '../services/auditService.js';
import { toCsv } from '../utils/csv.js';
import { issuePasswordSetupEmail } from '../services/passwordSetupService.js';

function toStaffDTO(membership) {
  return {
    id: membership._id,
    userId: membership.userId._id,
    name: membership.userId.name,
    email: membership.userId.email,
    role: membership.role,
    roleId: membership.roleId,
    locationId: membership.locationId || null,
    status: membership.status,
    hourlyRate: membership.hourlyRate || 0,
    joinedAt: membership.createdAt,
  };
}

// Mirrors DashboardPage.tsx's parseDurationToSeconds — Attendance.duration
// is a free-text "HH:MM:SS" (or legacy "MM:SS") string, not a numeric field.
function parseDurationToSeconds(durationStr) {
  if (!durationStr) return 0;
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

export async function listStaff(req, res) {
  try {
    const memberships = await StaffMembership.find({ restaurantId: req.restaurantId })
      .populate('userId', 'name email')
      .sort({ createdAt: 1 });
    res.json(memberships.map(toStaffDTO));
  } catch (err) {
    req.log.error({ err }, 'Error fetching staff list');
    res.status(500).json({ error: 'Failed to fetch staff list' });
  }
}

// Adds a staff member to this restaurant. If the email already belongs to a
// User elsewhere, that identity is reused (they already have a working
// password, so nothing else happens) and a new membership links it to this
// restaurant; otherwise a brand-new User is created with a random password
// nobody — including the inviter — ever sees, and the new hire gets an email
// with a link to set their own. If that email fails to send, the account
// still exists; "Forgot password" on the login screen serves as the resend.
export async function inviteStaff(req, res) {
  const { name, email, roleId, locationId } = req.body;
  const { restaurantId } = req;

  const session = await mongoose.startSession();
  try {
    const role = await Role.findOne({ _id: roleId, restaurantId });
    if (!role) {
      return res.status(400).json({ message: 'That role does not belong to this restaurant.' });
    }
    if (locationId) {
      const location = await Location.findOne({ _id: locationId, restaurantId });
      if (!location) {
        return res.status(400).json({ message: 'That location does not belong to this restaurant.' });
      }
    }

    let membership;
    let isNewUser = false;
    await session.withTransaction(async () => {
      let user = await User.findOne({ email: email.toLowerCase().trim() }).session(session);
      if (!user) {
        const placeholderPassword = crypto.randomBytes(24).toString('hex');
        user = (await User.create([{ name, email, password: placeholderPassword }], { session }))[0];
        isNewUser = true;
      }

      const existingMembership = await StaffMembership.findOne({
        userId: user._id,
        restaurantId,
      }).session(session);
      if (existingMembership) {
        throw Object.assign(new Error('This person is already a staff member of this restaurant.'), {
          status: 400,
        });
      }

      membership = (
        await StaffMembership.create(
          [
            {
              userId: user._id,
              restaurantId,
              locationId: locationId || null,
              role: role.name,
              roleId: role._id,
              status: 'active',
            },
          ],
          { session }
        )
      )[0];
      membership = await membership.populate('userId', 'name email');
    });

    let emailSent = true;
    if (isNewUser) {
      const restaurant = await Restaurant.findById(restaurantId).select('name');
      const user = await User.findById(membership.userId._id);
      const result = await issuePasswordSetupEmail({
        user,
        restaurantName: restaurant?.name || 'Restaurant Management Software',
        mode: 'invite',
      });
      emailSent = result.sent;
    }

    await logAudit(restaurantId, req.user, `invited ${membership.userId.name} as ${role.name}`, locationId || null);
    res.status(201).json({ ...toStaffDTO(membership), emailSent });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) req.log.error({ err }, 'Error inviting staff member');
    res.status(status).json({ message: err.status ? err.message : 'Failed to invite staff member.' });
  } finally {
    session.endSession();
  }
}

export async function updateStaffRole(req, res) {
  try {
    const { roleId, locationId } = req.body;
    const { restaurantId } = req;

    const membership = await StaffMembership.findOne({ _id: req.params.id, restaurantId }).populate(
      'userId',
      'name email'
    );
    if (!membership) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (membership.userId._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot change your own role.' });
    }

    const newRole = await Role.findOne({ _id: roleId, restaurantId });
    if (!newRole) {
      return res.status(400).json({ message: 'That role does not belong to this restaurant.' });
    }

    if (membership.role === 'Owner' && newRole.name !== 'Owner') {
      const ownerCount = await StaffMembership.countDocuments({ restaurantId, role: 'Owner' });
      if (ownerCount <= 1) {
        return res.status(400).json({ message: 'A restaurant must have at least one Owner.' });
      }
    }

    if (locationId) {
      const location = await Location.findOne({ _id: locationId, restaurantId });
      if (!location) {
        return res.status(400).json({ message: 'That location does not belong to this restaurant.' });
      }
    }

    const previousRole = membership.role;
    membership.role = newRole.name;
    membership.roleId = newRole._id;
    if (locationId !== undefined) {
      membership.locationId = locationId || null;
    }
    await membership.save();

    if (previousRole !== newRole.name) {
      await logAudit(
        restaurantId,
        req.user,
        `changed ${membership.userId.name}'s role from ${previousRole} to ${newRole.name}`
      );
    }

    res.json(toStaffDTO(membership));
  } catch (err) {
    req.log.error({ err }, 'Error updating staff role');
    res.status(500).json({ error: 'Failed to update staff role' });
  }
}

export async function removeStaff(req, res) {
  try {
    const { restaurantId } = req;

    const membership = await StaffMembership.findOne({ _id: req.params.id, restaurantId }).populate(
      'userId',
      'name email'
    );
    if (!membership) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    if (membership.userId._id.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot remove yourself from the restaurant.' });
    }

    if (membership.role === 'Owner') {
      const ownerCount = await StaffMembership.countDocuments({ restaurantId, role: 'Owner' });
      if (ownerCount <= 1) {
        return res.status(400).json({ message: 'A restaurant must have at least one Owner.' });
      }
    }

    await StaffMembership.deleteOne({ _id: membership._id });
    await logAudit(restaurantId, req.user, `removed ${membership.userId.name} (${membership.role}) from the restaurant`);
    res.json({ message: 'Staff member removed successfully.' });
  } catch (err) {
    req.log.error({ err }, 'Error removing staff member');
    res.status(500).json({ error: 'Failed to remove staff member' });
  }
}

export async function updateStaffRate(req, res) {
  try {
    const { hourlyRate } = req.body;
    const { restaurantId } = req;

    const membership = await StaffMembership.findOne({ _id: req.params.id, restaurantId }).populate(
      'userId',
      'name email'
    );
    if (!membership) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    membership.hourlyRate = hourlyRate;
    await membership.save();

    res.json(toStaffDTO(membership));
  } catch (err) {
    req.log.error({ err }, 'Error updating staff hourly rate');
    res.status(500).json({ error: 'Failed to update hourly rate' });
  }
}

const PAYROLL_CSV_COLUMNS = [
  { key: 'name', label: 'Staff Member' },
  { key: 'role', label: 'Role' },
  { key: 'hours', label: 'Hours Worked' },
  { key: 'hourlyRate', label: 'Hourly Rate' },
  { key: 'totalPay', label: 'Total Pay' },
];

// Hours x rate per staff member over a date range. Attendance.employeeName
// is free text (not a ref), so records are matched to a StaffMembership by
// display name — the same convention DashboardPage.tsx already relies on to
// scope a logged-in staff member's own history.
export async function exportPayrollCsv(req, res) {
  try {
    const { restaurantId, locationId } = req;
    const { startDate, endDate } = req.query;

    const memberships = await StaffMembership.find({ restaurantId, status: 'active' }).populate(
      'userId',
      'name'
    );

    const attendanceQuery = { restaurantId };
    if (locationId) attendanceQuery.locationId = locationId;
    if (startDate || endDate) {
      attendanceQuery.createdAt = {};
      if (startDate) attendanceQuery.createdAt.$gte = new Date(`${startDate}T00:00:00Z`);
      if (endDate) attendanceQuery.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }
    const attendanceRecords = await Attendance.find(attendanceQuery);

    const secondsByName = new Map();
    for (const rec of attendanceRecords) {
      const prior = secondsByName.get(rec.employeeName) || 0;
      secondsByName.set(rec.employeeName, prior + parseDurationToSeconds(rec.duration));
    }

    const rows = memberships.map((m) => {
      const totalSeconds = secondsByName.get(m.userId.name) || 0;
      const hours = totalSeconds / 3600;
      const hourlyRate = m.hourlyRate || 0;
      return {
        name: m.userId.name,
        role: m.role,
        hours: hours.toFixed(2),
        hourlyRate: hourlyRate.toFixed(2),
        totalPay: (hours * hourlyRate).toFixed(2),
      };
    });

    const csv = toCsv(rows, PAYROLL_CSV_COLUMNS);
    const filename = `payroll-export-${startDate || 'all'}-to-${endDate || 'now'}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    req.log.error({ err }, 'Error exporting payroll CSV');
    res.status(500).json({ error: 'Failed to export payroll' });
  }
}
