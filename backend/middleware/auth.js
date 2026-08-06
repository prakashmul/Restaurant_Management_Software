import jwt from 'jsonwebtoken';
import Location from '../models/Location.js';

// Verifies the Bearer token on the Authorization header and attaches
// { id, email, role, locationId } to req.user, plus the tenant boundary
// itself to req.restaurantId. locationId is null for staff unrestricted to
// a single location (see resolveLocationScope below for what happens next).
// Reads the secret lazily (not at module load time) so import order
// relative to dotenv can't matter.
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email, role: payload.role, locationId: payload.locationId || null };
    req.restaurantId = payload.restaurantId;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired session. Please sign in again.' });
  }
}

// Resolves req.locationId, the "which branch" context for the rest of the
// request. Staff confined to one location (req.user.locationId set) always
// get that location — the client can't override it. Unrestricted staff
// (Owners, most Managers) pick a location via the X-Location-Id header,
// validated against this restaurant so a request can't reference another
// tenant's location. No header and unrestricted => req.locationId is null,
// meaning "all locations" — only cross-location aggregation endpoints
// (Head Office) are expected to handle that; everything else requires a
// concrete location to write against.
export async function resolveLocationScope(req, res, next) {
  try {
    if (req.user.locationId) {
      req.locationId = req.user.locationId;
      return next();
    }
    const requested = req.headers['x-location-id'];
    if (!requested) {
      req.locationId = null;
      return next();
    }
    const location = await Location.findOne({ _id: requested, restaurantId: req.restaurantId }).select('_id');
    req.locationId = location ? location._id.toString() : null;
    return next();
  } catch (err) {
    req.locationId = null;
    return next();
  }
}

// Usage: requireRole('Owner') as a route-specific middleware after requireAuth.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}
