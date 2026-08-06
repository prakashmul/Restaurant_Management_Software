import request from 'supertest';
import User from '../../models/User.js';
import StaffMembership from '../../models/StaffMembership.js';

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
    await StaffMembership.updateOne(
      { userId: user._id, restaurantId },
      { role: overrides.role, locationId: overrides.locationId || null }
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
