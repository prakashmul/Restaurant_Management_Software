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

describe('expenses', () => {
  let expenseId;

  it('creates an expense entry', async () => {
    const res = await auth(request(app).post('/api/expenses')).send({
      category: 'rent',
      amount: 500,
      date: '2026-08-01',
      note: 'August rent',
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('rent');
    expect(res.body.amount).toBe(500);
    expect(res.body.note).toBe('August rent');
    expenseId = res.body._id;
  });

  it('rejects an invalid category', async () => {
    const res = await auth(request(app).post('/api/expenses')).send({
      category: 'not_a_real_category',
      amount: 100,
      date: '2026-08-01',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-positive amount', async () => {
    const res = await auth(request(app).post('/api/expenses')).send({
      category: 'rent',
      amount: 0,
      date: '2026-08-01',
    });
    expect(res.status).toBe(400);
  });

  it('lists expenses filtered by date range', async () => {
    await auth(request(app).post('/api/expenses')).send({ category: 'water', amount: 20, date: '2026-01-01' });

    const res = await auth(
      request(app).get('/api/expenses').query({ startDate: '2026-08-01', endDate: '2026-08-31' })
    );
    expect(res.status).toBe(200);
    expect(res.body.some((e) => e._id === expenseId)).toBe(true);
    expect(res.body.every((e) => e.date.slice(0, 10) >= '2026-08-01')).toBe(true);
  });

  it('updates an expense', async () => {
    const res = await auth(request(app).patch(`/api/expenses/${expenseId}`)).send({
      amount: 550,
      note: 'Updated rent',
    });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(550);
    expect(res.body.note).toBe('Updated rent');
  });

  it('rejects a role without expenses.view (Waiter) from listing expenses', async () => {
    const { token: waiterToken, locationId } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .get('/api/expenses')
      .set('Authorization', `Bearer ${waiterToken}`)
      .set('X-Location-Id', locationId);
    expect(res.status).toBe(403);
  });

  it('allows a Manager to log expenses', async () => {
    const { token: managerToken, locationId } = await createAuthedUser(app, { role: 'Manager' });
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${managerToken}`)
      .set('X-Location-Id', locationId)
      .send({ category: 'electricity', amount: 75, date: '2026-08-05' });
    expect(res.status).toBe(201);
  });

  it('404s when updating an expense that does not exist', async () => {
    const res = await auth(request(app).patch('/api/expenses/000000000000000000000000')).send({ amount: 1 });
    expect(res.status).toBe(404);
  });

  it('deletes an expense', async () => {
    const res = await auth(request(app).delete(`/api/expenses/${expenseId}`));
    expect(res.status).toBe(200);

    const listRes = await auth(request(app).get('/api/expenses'));
    expect(listRes.body.some((e) => e._id === expenseId)).toBe(false);
  });
});
