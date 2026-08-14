import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest, inviteAndLoginStaff } from './helpers/auth.js';

let app;
let teardown;
let ownerToken;
let mainLocationId;
let asOwner;
let roleIdByName;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const { token, locationId } = await createAuthedUser(app);
  ownerToken = token;
  mainLocationId = locationId;
  asOwner = authedRequest(token, locationId);

  const rolesRes = await asOwner(request(app).get('/api/roles'));
  roleIdByName = new Map(rolesRes.body.map((r) => [r.name, r._id]));
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('locations', () => {
  it('auto-creates exactly one "Main Location" at registration', async () => {
    const res = await asOwner(request(app).get('/api/locations'));
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Main Location');
    expect(res.body[0]._id).toBe(mainLocationId);
  });

  it('rejects a non-Owner from creating a location', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .post('/api/locations')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ name: 'Second Branch' });
    expect(res.status).toBe(403);
  });

  let secondLocationId;

  it('lets the Owner add a second location', async () => {
    const res = await asOwner(request(app).post('/api/locations')).send({
      name: 'Lakeside Branch',
      address: '123 Lake Rd',
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Lakeside Branch');
    secondLocationId = res.body._id;

    const listRes = await asOwner(request(app).get('/api/locations'));
    expect(listRes.body.length).toBe(2);
  });

  it('lets the Owner update a location', async () => {
    const res = await asOwner(request(app).patch(`/api/locations/${secondLocationId}`)).send({
      phone: '555-1234',
    });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('555-1234');
  });

  it('defaults a new location to Rs. and keeps each location\'s currency independent', async () => {
    const mainRes = await asOwner(request(app).get('/api/locations'));
    const main = mainRes.body.find((l) => l._id === mainLocationId);
    const second = mainRes.body.find((l) => l._id === secondLocationId);
    expect(main.currency).toBe('Rs.');
    expect(second.currency).toBe('Rs.');

    const updateRes = await asOwner(request(app).patch(`/api/locations/${secondLocationId}`)).send({
      currency: '$',
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.currency).toBe('$');

    const afterRes = await asOwner(request(app).get('/api/locations'));
    const mainAfter = afterRes.body.find((l) => l._id === mainLocationId);
    const secondAfter = afterRes.body.find((l) => l._id === secondLocationId);
    expect(mainAfter.currency).toBe('Rs.');
    expect(secondAfter.currency).toBe('$');
  });

  it('scopes tables independently per location within the same restaurant', async () => {
    // Registration already seeds one Table #1 at the Main Location, so use
    // a number that doesn't collide with it.
    const mainTableRes = await asOwner(request(app).post('/api/tables')).send({ number: 501, seats: 4 });
    // Same restaurant, but a DIFFERENT location — table #501 there is a distinct table.
    const asSecondLocation = authedRequest(ownerToken, secondLocationId);
    const secondTableRes = await asSecondLocation(request(app).post('/api/tables')).send({ number: 501, seats: 2 });

    expect(mainTableRes.status).toBe(201);
    expect(secondTableRes.status).toBe(201);
    expect(mainTableRes.body._id).not.toBe(secondTableRes.body._id);

    const mainTables = await asOwner(request(app).get('/api/tables'));
    expect(mainTables.body.some((t) => t._id === secondTableRes.body._id)).toBe(false);

    const secondTables = await asSecondLocation(request(app).get('/api/tables'));
    expect(secondTables.body.some((t) => t._id === mainTableRes.body._id)).toBe(false);
  });

  it('refuses to delete a location that still has tables', async () => {
    const res = await asOwner(request(app).delete(`/api/locations/${secondLocationId}`));
    expect(res.status).toBe(400);
  });

  it('refuses to delete the last remaining location', async () => {
    // Try deleting mainLocationId while the (now table-having) second
    // location also exists — this specifically tests the "last location"
    // guard, not the "has tables" guard, so use a fresh empty restaurant.
    const { token: freshToken, locationId: freshLocationId } = await createAuthedUser(app);
    const asFresh = authedRequest(freshToken, freshLocationId);
    const res = await asFresh(request(app).delete(`/api/locations/${freshLocationId}`));
    expect(res.status).toBe(400);
  });

  it('lets the Owner set and clear a location\'s attendance geofence', async () => {
    const setRes = await asOwner(request(app).patch(`/api/locations/${secondLocationId}/geofence`)).send({
      latitude: 27.7172,
      longitude: 85.324,
      radiusMeters: 150,
    });
    expect(setRes.status).toBe(200);
    expect(setRes.body.geofence).toEqual({ latitude: 27.7172, longitude: 85.324, radiusMeters: 150 });

    const clearRes = await asOwner(request(app).patch(`/api/locations/${secondLocationId}/geofence`)).send({
      latitude: null,
      longitude: null,
    });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.geofence.latitude).toBeNull();
    expect(clearRes.body.geofence.longitude).toBeNull();
    // radiusMeters defaults back rather than being left at the old value —
    // a full replace, not a merge.
    expect(clearRes.body.geofence.radiusMeters).toBe(300);
  });

  it('rejects a non-Owner (no locations.geofence by default) from setting the geofence, even with locations.manage-adjacent roles', async () => {
    const { token: waiterToken, locationId: waiterLocationId } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .patch(`/api/locations/${waiterLocationId}/geofence`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ latitude: 27.7, longitude: 85.3 });
    expect(res.status).toBe(403);
  });

  it('rejects out-of-range coordinates and a latitude/longitude mismatch', async () => {
    const outOfRange = await asOwner(request(app).patch(`/api/locations/${secondLocationId}/geofence`)).send({
      latitude: 200,
      longitude: 85.3,
    });
    expect(outOfRange.status).toBe(400);

    const mismatched = await asOwner(request(app).patch(`/api/locations/${secondLocationId}/geofence`)).send({
      latitude: 27.7,
      longitude: null,
    });
    expect(mismatched.status).toBe(400);
  });

  it('confines a location-restricted staff member to their assigned location regardless of the X-Location-Id header', async () => {
    const { token: waiterToken, inviteRes } = await inviteAndLoginStaff(app, asOwner, {
      name: 'Confined Waiter',
      email: 'confined-waiter@example.com',
      roleId: roleIdByName.get('Waiter'),
      locationId: mainLocationId,
    });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.locationId).toBe(mainLocationId);

    // Attempt to spoof a different location via the header — server must
    // ignore it and use the staff member's assigned location instead.
    const spoofedRes = await request(app)
      .get('/api/tables')
      .set('Authorization', `Bearer ${waiterToken}`)
      .set('X-Location-Id', secondLocationId);

    const mainOnlyRes = await asOwner(request(app).get('/api/tables'));
    const mainTableIds = new Set(mainOnlyRes.body.map((t) => t._id));

    expect(spoofedRes.status).toBe(200);
    expect(spoofedRes.body.every((t) => mainTableIds.has(t._id))).toBe(true);
  });
});
