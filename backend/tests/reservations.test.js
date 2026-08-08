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

describe('reservations', () => {
  it('books a reservation', async () => {
    const reservationTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await auth(request(app).post('/api/reservations')).send({
      customerName: 'Alice Smith',
      customerPhone: '9800000001',
      partySize: 4,
      reservationTime,
      notes: 'Window seat please',
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('reservation');
    expect(res.body.status).toBe('pending');
    expect(res.body.partySize).toBe(4);
  });

  it('rejects booking without a reservation time', async () => {
    const res = await auth(request(app).post('/api/reservations')).send({
      customerName: 'No Time',
      partySize: 2,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a role without reservations.manage (Kitchen) from booking', async () => {
    const { token: kitchenToken, locationId } = await createAuthedUser(app, { role: 'Kitchen' });
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .set('X-Location-Id', locationId)
      .send({ customerName: 'X', partySize: 2, reservationTime: new Date().toISOString() });
    expect(res.status).toBe(403);
  });

  it('lists open reservations sorted by time', async () => {
    const res = await auth(request(app).get('/api/reservations'));
    expect(res.status).toBe(200);
    expect(res.body.some((r) => r.customerName === 'Alice Smith')).toBe(true);
  });

  it('adds a walk-in to the waitlist', async () => {
    const res = await auth(request(app).post('/api/reservations/waitlist')).send({
      customerName: 'Walk-in Bob',
      customerPhone: '9800000002',
      partySize: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('waitlist');
    expect(res.body.status).toBe('waiting');
    expect(res.body.reservationTime).toBe(null);
  });

  it('rejects an invalid status transition', async () => {
    const created = await auth(request(app).post('/api/reservations/waitlist')).send({
      customerName: 'Invalid Transition',
      partySize: 1,
    });
    const seated = await auth(request(app).patch(`/api/reservations/${created.body._id}/status`)).send({
      status: 'seated',
    });
    expect(seated.status).toBe(200);

    // Already seated — can't go back to waiting.
    const res = await auth(request(app).patch(`/api/reservations/${created.body._id}/status`)).send({
      status: 'waiting',
    });
    expect(res.status).toBe(400);
  });

  it('seats a waitlist entry and records the table', async () => {
    const tableRes = await auth(request(app).post('/api/tables')).send({ number: 900, seats: 2 });
    const created = await auth(request(app).post('/api/reservations/waitlist')).send({
      customerName: 'Seat Me',
      partySize: 2,
    });

    const res = await auth(request(app).patch(`/api/reservations/${created.body._id}/status`)).send({
      status: 'seated',
      tableId: tableRes.body._id,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('seated');
    expect(res.body.tableId).toBe(tableRes.body._id);
  });

  it('cancels a reservation', async () => {
    const created = await auth(request(app).post('/api/reservations')).send({
      customerName: 'To Cancel',
      partySize: 3,
      reservationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    const res = await auth(request(app).patch(`/api/reservations/${created.body._id}/status`)).send({
      status: 'cancelled',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');

    const listRes = await auth(request(app).get('/api/reservations'));
    expect(listRes.body.some((r) => r._id === created.body._id)).toBe(false);
  });

  it('deletes a reservation entirely', async () => {
    const created = await auth(request(app).post('/api/reservations/waitlist')).send({
      customerName: 'To Delete',
      partySize: 1,
    });
    const res = await auth(request(app).delete(`/api/reservations/${created.body._id}`));
    expect(res.status).toBe(200);

    const listRes = await auth(request(app).get('/api/reservations?status=waiting'));
    expect(listRes.body.some((r) => r._id === created.body._id)).toBe(false);
  });
});
