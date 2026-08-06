import mongoose from 'mongoose';
import User from '../models/User.js';
import StaffMembership from '../models/StaffMembership.js';
import Location from '../models/Location.js';
import { logAudit } from '../services/auditService.js';

function toStaffDTO(membership) {
  return {
    id: membership._id,
    userId: membership.userId._id,
    name: membership.userId.name,
    email: membership.userId.email,
    role: membership.role,
    locationId: membership.locationId || null,
    status: membership.status,
    joinedAt: membership.createdAt,
  };
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
// User elsewhere, that identity is reused (its existing password stands —
// the submitted password is ignored) and a new membership links it to this
// restaurant; otherwise a brand-new User is created for them.
export async function inviteStaff(req, res) {
  const { name, email, password, role, locationId } = req.body;
  const { restaurantId } = req;

  const session = await mongoose.startSession();
  try {
    if (locationId) {
      const location = await Location.findOne({ _id: locationId, restaurantId });
      if (!location) {
        return res.status(400).json({ message: 'That location does not belong to this restaurant.' });
      }
    }

    let membership;
    await session.withTransaction(async () => {
      let user = await User.findOne({ email: email.toLowerCase().trim() }).session(session);
      if (!user) {
        user = (await User.create([{ name, email, password }], { session }))[0];
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
          [{ userId: user._id, restaurantId, locationId: locationId || null, role, status: 'active' }],
          { session }
        )
      )[0];
      membership = await membership.populate('userId', 'name email');
    });

    await logAudit(restaurantId, req.user, `invited ${membership.userId.name} as ${role}`, locationId || null);
    res.status(201).json(toStaffDTO(membership));
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
    const { role, locationId } = req.body;
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

    if (membership.role === 'Owner' && role !== 'Owner') {
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
    membership.role = role;
    if (locationId !== undefined) {
      membership.locationId = locationId || null;
    }
    await membership.save();

    if (previousRole !== role) {
      await logAudit(restaurantId, req.user, `changed ${membership.userId.name}'s role from ${previousRole} to ${role}`);
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
