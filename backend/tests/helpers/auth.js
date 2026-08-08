import request from 'supertest';
import User from '../../models/User.js';
import StaffMembership from '../../models/StaffMembership.js';
import Role from '../../models/Role.js';
import { hashResetToken } from '../../utils/resetToken.js';

let counter = 0;

// Registers a brand-new restaurant + Owner account and logs in, returning
// the token plus the identifiers tests need to assert tenant/location
// isolation. Each call spins up its own restaurant so tests never share
// tenant data. Pass { role: 'Manager' } (or any non-Owner role) to downgrade
// the account after registration but before login — the JWT bakes in the
// role at issuance time, so the downgrade must happen before the login call
// below. Pass { locationId } to confine the downgraded account to one
// location instead of leaving it unrestricted.
export async function createAuthedUser(app, overrides = {}) {
  counter += 1;
  const email = overrides.email || `user${Date.now()}${counter}@example.com`;
  const password = overrides.password || 'testpassword123';
  const name = overrides.name || 'Test User';
  const restaurantName = overrides.restaurantName || `Test Restaurant ${Date.now()}${counter}`;

  const registerRes = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password, restaurantName });

  const restaurantId = registerRes.body.restaurant.id;
  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (overrides.role && overrides.role !== 'Owner') {
    // register() seeds the 5 default roles for every new restaurant — reuse
    // the matching one so the downgraded account's roleId (the thing
    // requirePermission actually checks) stays consistent with its role
    // display name, exactly like a real role reassignment would.
    const role = await Role.findOne({ restaurantId, name: overrides.role });
    await StaffMembership.updateOne(
      { userId: user._id, restaurantId },
      { role: overrides.role, roleId: role._id, locationId: overrides.locationId || null }
    );
  }

  const loginRes = await request(app).post('/api/auth/login').send({ email, password });
  const token = loginRes.body.token;

  // Every restaurant gets exactly one auto-created "Main Location" at
  // registration — tests act within that location by default via the
  // X-Location-Id header, same as an Owner picking a location in the UI.
  const locationsRes = await request(app).get('/api/locations').set('Authorization', `Bearer ${token}`);
  const locationId = locationsRes.body[0]?._id;

  return { token, email, userId: user._id.toString(), restaurantId, locationId };
}

// Invites a staff member into an EXISTING restaurant via the real invite
// endpoint (unlike createAuthedUser, which always spins up a brand-new
// tenant), then completes the set-password flow the same way a real invite
// email link would, and logs in. Returns { token, inviteRes } — inviteRes
// for tests that want to assert on the invite response itself. Since
// invites no longer carry a client-supplied password (see
// staffController.js), the DB has only the reset token's hash — this mints
// its own raw token and writes the matching hash directly, exactly like the
// real emailed link would produce.
export async function inviteAndLoginStaff(app, asOwnerReq, { name, email, roleId, locationId }) {
  const inviteRes = await asOwnerReq(request(app).post('/api/staff/invite')).send({ name, email, roleId, locationId });

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordResetTokenHash');
  const rawToken = `test-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  user.passwordResetTokenHash = hashResetToken(rawToken);
  await user.save();

  const password = 'testpassword123';
  await request(app).post('/api/auth/reset-password').send({ token: rawToken, password });

  const loginRes = await request(app).post('/api/auth/login').send({ email, password });
  return { token: loginRes.body.token, inviteRes };
}

// Chains the Authorization + X-Location-Id headers onto a supertest
// request — the standard way tests authenticate as a specific staff member
// acting within a specific location.
export function authedRequest(token, locationId) {
  return (req) => {
    req.set('Authorization', `Bearer ${token}`);
    if (locationId) req.set('X-Location-Id', locationId);
    return req;
  };
}
