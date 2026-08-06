import AuditLogEntry from '../models/AuditLogEntry.js';
import User from '../models/User.js';
import { logger } from '../middleware/logger.js';

// Writes one human-readable audit trail entry. Never throws — a failure to
// log a sensitive action must not break the action itself. locationId is
// omitted (left null) for organization-wide actions like deleting a shared
// menu item.
export async function logAudit(restaurantId, user, action, locationId = null) {
  try {
    const userDoc = await User.findById(user.id).select('name');
    await AuditLogEntry.create({
      restaurantId,
      locationId,
      actorName: userDoc?.name || user.email,
      actorEmail: user.email,
      action,
    });
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log entry');
  }
}
