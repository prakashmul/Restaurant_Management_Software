import jwt from 'jsonwebtoken';

// Entirely separate from requireAuth (middleware/auth.js) — a platform admin
// token has a different shape ({ sub, email, platformAdmin: true }, no
// restaurantId/role/locationId) and must never be accepted by tenant-scoped
// routes, nor should a tenant JWT ever be accepted here.
export function requirePlatformAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.platformAdmin) {
      return res.status(403).json({ message: 'This account cannot access the admin console.' });
    }
    req.platformAdmin = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired session. Please sign in again.' });
  }
}
