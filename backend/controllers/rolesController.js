import mongoose from 'mongoose';
import Role from '../models/Role.js';
import StaffMembership from '../models/StaffMembership.js';
import { ALL_PERMISSIONS, PERMISSION_SECTIONS } from '../permissions.js';
import { logAudit } from '../services/auditService.js';

export function getPermissionCatalog(req, res) {
  res.json(PERMISSION_SECTIONS);
}

// Every authenticated user needs to know their own capabilities — to decide
// what the sidebar shows them, if nothing else — regardless of their role.
// listRoles below is deliberately admin-only (staff.view), since seeing
// every role's full permission set is organization-management data; this is
// the unprivileged counterpart that only ever exposes the caller's own list.
export async function getMyPermissions(req, res) {
  try {
    const membership = await StaffMembership.findOne({ userId: req.user.id, restaurantId: req.restaurantId }).select(
      'roleId'
    );
    if (!membership?.roleId) {
      return res.json({ permissions: [] });
    }
    const role = await Role.findById(membership.roleId).select('permissions');
    res.json({ permissions: role?.permissions || [] });
  } catch (err) {
    req.log.error({ err }, 'Error fetching own permissions');
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
}

function toRoleDTO(role, userCountByRoleId) {
  return {
    _id: role._id,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    isOwnerRole: role.name === 'Owner',
    userCount: userCountByRoleId.get(role._id.toString()) || 0,
  };
}

export async function listRoles(req, res) {
  try {
    const { restaurantId } = req;
    const [roles, counts] = await Promise.all([
      // Owner pinned first, everything else alphabetical — createdAt ties
      // from batch-seeding (all 5 default roles inserted in the same
      // millisecond) otherwise sort unpredictably.
      Role.find({ restaurantId }).collation({ locale: 'en', strength: 2 }).sort({ name: 1 }).then((docs) =>
        docs.sort((a, b) => (a.name === 'Owner' ? -1 : b.name === 'Owner' ? 1 : 0))
      ),
      // .aggregate() doesn't auto-cast query values against the schema the
      // way .find() does — restaurantId arrives here as the string from the
      // JWT, so it has to be cast to ObjectId by hand or $match silently
      // matches nothing.
      StaffMembership.aggregate([
        { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId) } },
        { $group: { _id: '$roleId', count: { $sum: 1 } } },
      ]),
    ]);
    const userCountByRoleId = new Map(counts.map((c) => [c._id.toString(), c.count]));
    res.json(roles.map((r) => toRoleDTO(r, userCountByRoleId)));
  } catch (err) {
    req.log.error({ err }, 'Error fetching roles');
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
}

export async function createRole(req, res) {
  try {
    const { restaurantId } = req;
    const { name, description, permissions } = req.body;

    if (name.trim() === 'Owner') {
      return res.status(400).json({ message: '"Owner" is a reserved role name.' });
    }
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length > 0) {
      return res.status(400).json({ message: `Unknown permission(s): ${invalid.join(', ')}` });
    }

    const existing = await Role.findOne({ restaurantId, name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: 'A role with this name already exists.' });
    }

    const role = await Role.create({ restaurantId, name: name.trim(), description: description || '', permissions });
    await logAudit(restaurantId, req.user, `created a custom role "${role.name}"`);

    res.status(201).json(toRoleDTO(role, new Map()));
  } catch (err) {
    req.log.error({ err }, 'Error creating role');
    res.status(500).json({ error: 'Failed to create role' });
  }
}

export async function updateRole(req, res) {
  try {
    const { restaurantId } = req;
    const { name, description, permissions } = req.body;

    const role = await Role.findOne({ _id: req.params.id, restaurantId });
    if (!role) {
      return res.status(404).json({ message: 'Role not found.' });
    }
    if (role.name === 'Owner') {
      return res.status(400).json({ message: 'The Owner role always has full access and cannot be edited.' });
    }

    if (permissions) {
      const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
      if (invalid.length > 0) {
        return res.status(400).json({ message: `Unknown permission(s): ${invalid.join(', ')}` });
      }
      role.permissions = permissions;
    }

    if (name && name.trim() !== role.name) {
      if (name.trim() === 'Owner') {
        return res.status(400).json({ message: '"Owner" is a reserved role name.' });
      }
      const existing = await Role.findOne({ restaurantId, name: name.trim(), _id: { $ne: role._id } });
      if (existing) {
        return res.status(400).json({ message: 'A role with this name already exists.' });
      }
      const previousName = role.name;
      role.name = name.trim();
      await StaffMembership.updateMany({ restaurantId, roleId: role._id }, { $set: { role: role.name } });
      await logAudit(restaurantId, req.user, `renamed role "${previousName}" to "${role.name}"`);
    }

    if (description !== undefined) role.description = description;

    await role.save();
    await logAudit(restaurantId, req.user, `updated permissions for role "${role.name}"`);

    const count = await StaffMembership.countDocuments({ restaurantId, roleId: role._id });
    res.json(toRoleDTO(role, new Map([[role._id.toString(), count]])));
  } catch (err) {
    req.log.error({ err }, 'Error updating role');
    res.status(500).json({ error: 'Failed to update role' });
  }
}

export async function deleteRole(req, res) {
  try {
    const { restaurantId } = req;
    const role = await Role.findOne({ _id: req.params.id, restaurantId });
    if (!role) {
      return res.status(404).json({ message: 'Role not found.' });
    }
    if (role.name === 'Owner') {
      return res.status(400).json({ message: 'The Owner role cannot be deleted.' });
    }
    const inUse = await StaffMembership.exists({ restaurantId, roleId: role._id });
    if (inUse) {
      return res.status(400).json({ message: 'Reassign staff off this role before deleting it.' });
    }

    await Role.deleteOne({ _id: role._id });
    await logAudit(restaurantId, req.user, `deleted role "${role.name}"`);
    res.json({ message: 'Role deleted successfully.' });
  } catch (err) {
    req.log.error({ err }, 'Error deleting role');
    res.status(500).json({ error: 'Failed to delete role' });
  }
}
