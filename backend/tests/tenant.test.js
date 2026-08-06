import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';

let app;
let teardown;
let tokenA;
let tokenB;
let authA;
let authB;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const a = await createAuthedUser(app);
  const b = await createAuthedUser(app);
  tokenA = a.token;
  tokenB = b.token;
  authA = authedRequest(a.token, a.locationId);
  authB = authedRequest(b.token, b.locationId);
}, 60000);

afterAll(async () => {
  await teardown();
});

const authAs = (token) => (token === tokenA ? authA : authB);

describe('tenant isolation', () => {
  it('does not leak categories created in one restaurant into another', async () => {
    await authAs(tokenA)(request(app).post('/api/categories')).send({ name: 'Only In A' });

    const listA = await authAs(tokenA)(request(app).get('/api/categories'));
    const listB = await authAs(tokenB)(request(app).get('/api/categories'));

    expect(listA.body.some((c) => c.name === 'Only In A')).toBe(true);
    expect(listB.body.some((c) => c.name === 'Only In A')).toBe(false);
  });

  it('allows the same table number to exist independently in two restaurants', async () => {
    const resA = await authAs(tokenA)(request(app).post('/api/tables')).send({ number: 501, seats: 4 });
    const resB = await authAs(tokenB)(request(app).post('/api/tables')).send({ number: 501, seats: 2 });

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body._id).not.toBe(resB.body._id);
  });

  it('returns 404 when restaurant B tries to fetch/act on an order that belongs to restaurant A', async () => {
    const tableRes = await authAs(tokenA)(request(app).post('/api/tables')).send({ number: 502, seats: 2 });
    const menuRes = await authAs(tokenA)(request(app).post('/api/menu')).send({
      name: 'A-Only Dish',
      category: 'Main Course',
      price: 10,
    });

    const saveRes = await authAs(tokenA)(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: menuRes.body._id, name: 'A-Only Dish', price: 10, quantity: 1 }],
    });
    const orderId = saveRes.body._id;

    const payAsB = await authAs(tokenB)(request(app).post(`/api/orders/${orderId}/pay`)).send({
      paymentMethod: 'cash',
    });
    expect(payAsB.status).toBe(404);

    const deleteAsB = await authAs(tokenB)(request(app).delete(`/api/orders/${orderId}`));
    // Delete is unconditional-looking but scoped internally; a cross-tenant
    // delete must be a silent no-op (still 200), never actually removing it.
    expect(deleteAsB.status).toBe(200);

    const stillListedForA = await authAs(tokenA)(request(app).get('/api/orders'));
    expect(stillListedForA.body.some((o) => o._id === orderId)).toBe(true);
  });

  it('does not include restaurant B tables in restaurant A table list', async () => {
    const listA = await authAs(tokenA)(request(app).get('/api/tables'));
    const listB = await authAs(tokenB)(request(app).get('/api/tables'));

    const aIds = new Set(listA.body.map((t) => t._id));
    const bIds = new Set(listB.body.map((t) => t._id));
    const overlap = [...aIds].filter((id) => bIds.has(id));
    expect(overlap.length).toBe(0);
  });
});
