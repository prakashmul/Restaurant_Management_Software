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

async function placeCreditOrder(tableNumber, price, customerName, customerPhone) {
  const tableRes = await auth(request(app).post('/api/tables')).send({ number: tableNumber, seats: 2 });
  const menuRes = await auth(request(app).post('/api/menu')).send({
    name: `Dish-${tableNumber}`,
    category: 'Main Course',
    price,
  });
  const saved = await auth(request(app).post('/api/orders/save')).send({
    tableId: tableRes.body._id,
    items: [{ menuItemId: menuRes.body._id, name: 'Dish', price, quantity: 1 }],
  });
  return auth(request(app).post(`/api/orders/${saved.body._id}/credit`)).send({ customerName, customerPhone });
}

describe('customers', () => {
  it('rejects Kitchen (no customers permission by default) from viewing customers', async () => {
    const { token: kitchenToken, locationId } = await createAuthedUser(app, { role: 'Kitchen' });
    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${kitchenToken}`)
      .set('X-Location-Id', locationId);
    expect(res.status).toBe(403);
  });

  let customerId;

  it('lists a customer with lifetime spend and outstanding credit aggregated from their orders', async () => {
    await placeCreditOrder(300, 250, 'Repeat Customer', '9800000001');
    const res = await auth(request(app).get('/api/customers'));
    expect(res.status).toBe(200);

    const customer = res.body.find((c) => c.name === 'Repeat Customer');
    expect(customer).toBeTruthy();
    expect(customer.ordersCount).toBe(1);
    expect(customer.lifetimeSpend).toBeCloseTo(250 * 1.08, 5);
    expect(customer.outstandingCredit).toBeCloseTo(250 * 1.08, 5);
    customerId = customer._id;
  });

  it('reflects a second order and a partial payment in the aggregated stats', async () => {
    await placeCreditOrder(301, 100, 'Repeat Customer', '9800000001');
    await auth(request(app).post('/api/orders/credit/partial-pay')).send({
      customerPhone: '9800000001',
      amount: 50,
    });

    const res = await auth(request(app).get('/api/customers'));
    const customer = res.body.find((c) => c._id === customerId);
    expect(customer.ordersCount).toBe(2);
    expect(customer.lifetimeSpend).toBeCloseTo(250 * 1.08 + 100 * 1.08, 5);
    expect(customer.outstandingCredit).toBeCloseTo(250 * 1.08 + 100 * 1.08 - 50, 5);
  });

  it('returns full order history for a single customer', async () => {
    const res = await auth(request(app).get(`/api/customers/${customerId}`));
    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('Repeat Customer');
    expect(res.body.orders.length).toBe(2);
    expect(res.body.stats.ordersCount).toBe(2);
  });

  it('lets an authorized role edit a customer profile', async () => {
    const res = await auth(request(app).patch(`/api/customers/${customerId}`)).send({ name: 'Renamed Customer' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Customer');
  });

  it('rejects renaming to a phone number already used by another customer at this location', async () => {
    await placeCreditOrder(302, 50, 'Other Customer', '9800000002');
    const res = await auth(request(app).patch(`/api/customers/${customerId}`)).send({ phone: '9800000002' });
    expect(res.status).toBe(400);
  });

  it('404s for a customer that does not exist', async () => {
    const res = await auth(request(app).get('/api/customers/000000000000000000000000'));
    expect(res.status).toBe(404);
  });
});
