import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';

let app;
let teardown;
let ownerToken;
let mainLocationId;
let secondLocationId;
let asOwner;
let asMain;
let asSecond;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const { token, locationId } = await createAuthedUser(app);
  ownerToken = token;
  mainLocationId = locationId;
  asOwner = authedRequest(token, locationId);
  asMain = asOwner;

  const secondRes = await asOwner(request(app).post('/api/locations')).send({ name: 'Branch Two' });
  secondLocationId = secondRes.body._id;
  asSecond = authedRequest(ownerToken, secondLocationId);
}, 60000);

afterAll(async () => {
  await teardown();
});

async function placeAndPayOrder(authFn, tableNumber, menuItemId, price, quantity) {
  const tableRes = await authFn(request(app).post('/api/tables')).send({ number: tableNumber, seats: 2 });
  const saved = await authFn(request(app).post('/api/orders/save')).send({
    tableId: tableRes.body._id,
    items: [{ menuItemId, name: 'Dish', price, quantity }],
  });
  await authFn(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });
  return saved.body._id;
}

describe('head office', () => {
  it('rejects a non-Owner from the head office summary', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app).get('/api/head-office/summary').set('Authorization', `Bearer ${waiterToken}`);
    expect(res.status).toBe(403);
  });

  it('returns one entry per location, correctly attributing sales to each', async () => {
    const invRes = await asOwner(request(app).post('/api/inventory')).send({
      name: 'HO Ingredient',
      totalQuantity: 100,
      unit: 'units',
      costPerUnit: 5,
    });
    // Stock is per-location — Branch Two starts with none of this shared
    // ingredient, so it needs its own stock before it can sell a dish that
    // consumes it.
    await asSecond(request(app).patch(`/api/inventory/${invRes.body._id}/restock`)).send({
      quantity: 100,
      description: 'Seed stock at Branch Two for head office test',
    });
    const menuRes = await asOwner(request(app).post('/api/menu')).send({
      name: 'HO Dish',
      category: 'Main Course',
      price: 50,
      recipe: [{ inventoryItemId: invRes.body._id, quantityPerPortion: 2 }], // cost 10, margin 40
    });
    const menuItemId = menuRes.body._id;

    await placeAndPayOrder(asMain, 601, menuItemId, 50, 2); // subtotal Rs. 100 at Main
    await placeAndPayOrder(asSecond, 601, menuItemId, 50, 1); // subtotal Rs. 50 at Branch Two

    const res = await asOwner(request(app).get('/api/head-office/summary'));
    expect(res.status).toBe(200);
    expect(res.body.locations.length).toBe(2);

    const main = res.body.locations.find((l) => l.id === mainLocationId);
    const branch = res.body.locations.find((l) => l.id === secondLocationId);

    // saveOrder adds 8% tax on top of subtotal (see ordersController.saveOrder).
    expect(main.todaySales).toBeCloseTo(100 * 1.08, 5);
    expect(branch.todaySales).toBeCloseTo(50 * 1.08, 5);
    // Same shared menu item and ingredient cost, but computed independently
    // per location from each location's own orders — both land on the same
    // ratio here since quantity scaled proportionally with price.
    expect(main.foodCostPercent).toBeCloseTo(branch.foodCostPercent, 5);
    expect(main.foodCostPercent).toBeCloseTo((20 / (100 * 1.08)) * 100, 5); // ingredientCost 10*2=20
  });

  it("reports each location's own currency, not a single shared one", async () => {
    let res = await asOwner(request(app).get('/api/head-office/summary'));
    let main = res.body.locations.find((l) => l.id === mainLocationId);
    let branch = res.body.locations.find((l) => l.id === secondLocationId);
    expect(main.currency).toBe('Rs.');
    expect(branch.currency).toBe('Rs.');

    await asOwner(request(app).patch(`/api/locations/${secondLocationId}`)).send({ currency: '$' });

    res = await asOwner(request(app).get('/api/head-office/summary'));
    main = res.body.locations.find((l) => l.id === mainLocationId);
    branch = res.body.locations.find((l) => l.id === secondLocationId);
    expect(main.currency).toBe('Rs.');
    expect(branch.currency).toBe('$');
  });

  it('reports outstanding credit exposure per location', async () => {
    const menuRes = await asOwner(request(app).post('/api/menu')).send({
      name: 'HO Credit Dish',
      category: 'Main Course',
      price: 300,
    });
    const tableRes = await asMain(request(app).post('/api/tables')).send({ number: 602, seats: 2 });
    const saved = await asMain(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: menuRes.body._id, name: 'HO Credit Dish', price: 300, quantity: 1 }],
    });
    await asMain(request(app).post(`/api/orders/${saved.body._id}/credit`)).send({
      customerName: 'HO Customer',
      customerPhone: '9811111111',
    });

    const res = await asOwner(request(app).get('/api/head-office/summary'));
    const main = res.body.locations.find((l) => l.id === mainLocationId);
    const branch = res.body.locations.find((l) => l.id === secondLocationId);

    expect(main.creditExposure).toBeGreaterThanOrEqual(300);
    expect(branch.creditExposure).toBe(0);
  });
});
