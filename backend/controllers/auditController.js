import AuditLogEntry from '../models/AuditLogEntry.js';

export async function listAuditLog(req, res) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const entries = await AuditLogEntry.find({ restaurantId: req.restaurantId })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(entries);
  } catch (err) {
    req.log.error({ err }, 'Error fetching audit log');
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
}
