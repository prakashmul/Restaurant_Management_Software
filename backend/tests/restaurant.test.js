import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';

let app;
let teardown;
let auth;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const { token, locationId } = await createAuthedUser(app);
  auth = authedRequest(token, locationId);
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('restaurant settings', () => {
  it('lets any authenticated staff member view basic restaurant info', async () => {
    const { token: waiterToken, locationId } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .get('/api/restaurant')
      .set('Authorization', `Bearer ${waiterToken}`)
      .set('X-Location-Id', locationId);
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('Rs.');
  });

  it('rejects a Manager (no settings.restaurant by default) from updating restaurant settings', async () => {
    const { token: managerToken, locationId } = await createAuthedUser(app, { role: 'Manager' });
    const res = await request(app)
      .patch('/api/restaurant')
      .set('Authorization', `Bearer ${managerToken}`)
      .set('X-Location-Id', locationId)
      .send({ name: 'Should Fail' });
    expect(res.status).toBe(403);
  });

  it('lets the Owner update name, currency, and tax rate', async () => {
    const res = await auth(request(app).patch('/api/restaurant')).send({
      name: 'Renamed Diner',
      currency: '$',
      taxRatePercent: 10,
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Diner');
    expect(res.body.currency).toBe('$');
    expect(res.body.taxRatePercent).toBe(10);

    const getRes = await auth(request(app).get('/api/restaurant'));
    expect(getRes.body.name).toBe('Renamed Diner');
  });

  it('rejects a tax rate over 100%', async () => {
    const res = await auth(request(app).patch('/api/restaurant')).send({ taxRatePercent: 150 });
    expect(res.status).toBe(400);
  });
});
