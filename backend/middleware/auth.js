import jwt from 'jsonwebtoken';
import Location from '../models/Location.js';
import StaffMembership from '../models/StaffMembership.js';
import Role from '../models/Role.js';
import Restaurant from '../models/Restaurant.js';
import { PERMISSION_REQUIRED_PAGE } from '../permissions.js';

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
    // A platform-admin token (see platformAdminAuth.js) carries no
    // restaurantId — reject it explicitly rather than falling through with
    // req.restaurantId undefined, which would make every tenant-scoped
    // query stop filtering by restaurant and leak data across tenants.
    if (payload.platformAdmin) {
      return res.status(401).json({ message: 'Invalid or expired session. Please sign in again.' });
    }
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

// Usage: requirePermission('orders.void') as a route-specific middleware
// after requireAuth. This is never satisfied by anything baked into the
// JWT — it always re-reads the caller's current Role.permissions from the
// database, so editing a role's permissions (or reassigning someone to a
// different role) takes effect on their very next request, not on their
// next login.
export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Authentication required.' });
      }
      const [membership, restaurant] = await Promise.all([
        StaffMembership.findOne({ userId: req.user.id, restaurantId: req.restaurantId }).select('roleId'),
        Restaurant.findById(req.restaurantId).select('enabledPages'),
      ]);
      if (!membership?.roleId) {
        return res.status(403).json({ message: 'You do not have permission to perform this action.' });
      }
      const role = await Role.findById(membership.roleId).select('permissions');
      if (!role || !role.permissions.includes(permissionKey)) {
        return res.status(403).json({ message: 'You do not have permission to perform this action.' });
      }
      // Authoritative version of the same page-level AND-gate the frontend
      // Sidebar applies for navigation — a role having this permission
      // checked isn't enough on its own if the restaurant's plan doesn't
      // include the page it lives under (e.g. settings.headoffice requires
      // page.headoffice). Applies even to Owners. Undefined enabledPages
      // (a pre-existing/grandfathered restaurant) means unrestricted, same
      // convention used everywhere else this field is checked.
      const requiredPage = PERMISSION_REQUIRED_PAGE[permissionKey];
      if (requiredPage && restaurant?.enabledPages && !restaurant.enabledPages.includes(requiredPage)) {
        return res.status(403).json({ message: 'This feature is not included in your current plan.' });
      }
      return next();
    } catch (err) {
      req.log?.error({ err }, 'Error checking permission');
      return res.status(500).json({ message: 'Failed to verify permissions.' });
    }
  };
}
