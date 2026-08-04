import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser } from './helpers/auth.js';

let app;
let teardown;
let token;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  ({ token } = await createAuthedUser(app));
}, 60000);

afterAll(async () => {
  await teardown();
});

const auth = (req) => req.set('Authorization', `Bearer ${token}`);

// Creates a table + an inventory item + a menu item whose recipe consumes
// `stock` units of that ingredient per portion. Returns their ids.
async function setupOrderFixtures(tableNumber, stock) {
  const tableRes = await auth(request(app).post('/api/tables')).send({ number: tableNumber, seats: 2 });
  const tableId = tableRes.body._id;

  const invRes = await auth(request(app).post('/api/inventory')).send({
    name: `Ingredient-${tableNumber}`,
    totalQuantity: stock,
    unit: 'units',
    costPerUnit: 1,
  });
  const inventoryItemId = invRes.body._id;

  const menuRes = await auth(request(app).post('/api/menu')).send({
    name: `Dish-${tableNumber}`,
    category: 'Main Course',
    price: 10,
    recipe: [{ inventoryItemId, quantityPerPortion: 2 }],
  });
  const menuItemId = menuRes.body._id;

  return { tableId, inventoryItemId, menuItemId };
}

describe('order save', () => {
  it('creates a pending order and marks the table occupied', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(101, 10);

    const res = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');

    const tableRes = await auth(request(app).get('/api/tables'));
    const table = tableRes.body.find((t) => t._id === tableId);
    expect(table.status).toBe('occupied');
  });

  it('saving twice to the same table updates the existing pending order, not a duplicate', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(102, 10);

    const first = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    const second = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }],
    });

    expect(second.body._id).toBe(first.body._id);

    const ordersRes = await auth(request(app).get('/api/orders'));
    const pendingForTable = ordersRes.body.filter((o) => o.tableId === tableId && o.status === 'pending');
    expect(pendingForTable.length).toBe(1);
  });
});

describe('payment transaction', () => {
  it('pays an order and atomically deducts recipe stock', async () => {
    const { tableId, menuItemId, inventoryItemId } = await setupOrderFixtures(103, 10);

    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }], // needs 2*2=4 units
    });
    const orderId = saved.body._id;

    const payRes = await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });
    expect(payRes.status).toBe(200);
    expect(payRes.body.order.status).toBe('paid');

    const inv = payRes.body.inventory.find((i) => i._id === inventoryItemId);
    expect(inv.totalQuantity).toBe(6); // 10 - 4
  });

  it('rejects payment when stock is insufficient and rolls back cleanly', async () => {
    const { tableId, menuItemId, inventoryItemId } = await setupOrderFixtures(104, 1); // only 1 unit in stock

    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }], // needs 2 units, only 1 available
    });
    const orderId = saved.body._id;

    const payRes = await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });
    expect(payRes.status).toBe(409);

    // Transaction must have rolled back completely: order still pending, stock untouched.
    const ordersRes = await auth(request(app).get('/api/orders'));
    const order = ordersRes.body.find((o) => o._id === orderId);
    expect(order.status).toBe('pending');

    const invRes = await auth(request(app).get('/api/inventory'));
    const inv = invRes.body.find((i) => i._id === inventoryItemId);
    expect(inv.totalQuantity).toBe(1);
  });

  it('rejects paying an order twice', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(105, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    const orderId = saved.body._id;

    await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });
    const secondPay = await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });
    expect(secondPay.status).toBe(400);
  });
});

describe('referential integrity on delete', () => {
  it('refuses to delete a table with an active pending order', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(106, 10);
    await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const res = await auth(request(app).delete(`/api/tables/${tableId}`));
    expect(res.status).toBe(400);
  });

  it('refuses to delete a menu item referenced by an active pending order', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(107, 10);
    await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const res = await auth(request(app).delete(`/api/menu/${menuItemId}`));
    expect(res.status).toBe(400);
  });
});

describe('role-based access control', () => {
  it('rejects a Staff user from the Owner-only stock history endpoint', async () => {
    const res = await auth(request(app).get('/api/inventory/history'));
    expect(res.status).toBe(403);
  });

  it('allows an Owner to access the stock history endpoint', async () => {
    const { token: ownerToken } = await createAuthedUser(app, { role: 'Owner' });
    const res = await request(app).get('/api/inventory/history').set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });
});
