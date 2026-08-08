import AuditLogEntry from '../models/AuditLogEntry.js';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listAuditLog(req, res) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const { actorEmail, q, startDate, endDate } = req.query;

    const query = { restaurantId: req.restaurantId };
    if (actorEmail) query.actorEmail = actorEmail;
    if (q) query.action = { $regex: escapeRegex(q), $options: 'i' };
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(`${startDate}T00:00:00Z`);
      if (endDate) query.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const entries = await AuditLogEntry.find(query).sort({ createdAt: -1 }).limit(limit);
    res.json(entries);
  } catch (err) {
    req.log.error({ err }, 'Error fetching audit log');
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
}
