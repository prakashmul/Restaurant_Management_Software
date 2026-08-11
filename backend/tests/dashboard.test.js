import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';
import Order from '../models/Order.js';

let app;
let teardown;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
}, 60000);

afterAll(async () => {
  await teardown();
});

// Each test spins up its own restaurant (via createAuthedUser) so the
// all-time dashboard summary numbers are exact and never bleed across tests.
describe('dashboard summary', () => {
  it('computes gross profit as revenue minus ingredient cost (momo sold at 200, costing 75, profit 125)', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);
    await asOwner(request(app).patch('/api/restaurant')).send({ taxRatePercent: 0 });

    const invRes = await asOwner(request(app).post('/api/inventory')).send({
      name: 'Momo Filling',
      totalQuantity: 100,
      unit: 'units',
      costPerUnit: 75,
    });
    const menuRes = await asOwner(request(app).post('/api/menu')).send({
      name: 'Momo',
      category: 'Main Course',
      price: 200,
      recipe: [{ inventoryItemId: invRes.body._id, quantityPerPortion: 1 }],
    });
    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 501, seats: 2 });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: menuRes.body._id, name: 'Momo', price: 200, quantity: 1 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const res = await asOwner(request(app).get('/api/dashboard/summary'));
    expect(res.status).toBe(200);
    expect(res.body.grossSales).toBe(200);
    expect(res.body.netPaidSales).toBe(200);
    expect(res.body.totalOrdersCount).toBe(1);
    expect(res.body.grossProfit).toBe(125);
    expect(res.body.dishesMissingCostData).toBe(false);
  });

  it('nets a discount out of Gross Sales (already baked into order.total)', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);
    await asOwner(request(app).patch('/api/restaurant')).send({ taxRatePercent: 0 });

    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 502, seats: 2 });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: 'x1', name: 'Item', price: 100, quantity: 2 }], // subtotal 200
    });
    await asOwner(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({
      type: 'flat',
      value: 50,
      reason: 'loyal customer',
    }); // total becomes 150
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const res = await asOwner(request(app).get('/api/dashboard/summary'));
    expect(res.body.grossSales).toBe(150);
  });

  it('nets a partial refund out of Gross Sales', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);
    await asOwner(request(app).patch('/api/restaurant')).send({ taxRatePercent: 0 });

    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 503, seats: 2 });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: 'x1', name: 'Item', price: 100, quantity: 1 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });
    await asOwner(request(app).patch(`/api/orders/${saved.body._id}/refund`)).send({
      amount: 40,
      reason: 'complaint',
    });

    const res = await asOwner(request(app).get('/api/dashboard/summary'));
    expect(res.body.grossSales).toBe(60); // 100 - 40 refunded
    expect(res.body.netPaidSales).toBe(60);
  });

  it('computes net profit as gross profit minus logged expenses in range', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);
    await asOwner(request(app).patch('/api/restaurant')).send({ taxRatePercent: 0 });

    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 504, seats: 2 });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: 'x1', name: 'Item', price: 100, quantity: 1 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });
    // No matching MenuItem for 'x1', so this order is uncosted -> orderCost 0, grossProfit = 100.

    const today = new Date().toISOString().slice(0, 10);
    await asOwner(request(app).post('/api/expenses')).send({ category: 'rent', amount: 30, date: today });

    const res = await asOwner(request(app).get('/api/dashboard/summary'));
    expect(res.body.grossProfit).toBe(100);
    expect(res.body.totalExpenses).toBe(30);
    expect(res.body.netProfit).toBe(70);
    expect(res.body.dishesMissingCostData).toBe(true);
  });

  it('excludes orders and expenses outside the requested date range', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);

    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 505, seats: 2 });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: 'x1', name: 'Item', price: 100, quantity: 1 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });
    await asOwner(request(app).post('/api/expenses')).send({ category: 'rent', amount: 50, date: new Date().toISOString().slice(0, 10) });

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const res = await asOwner(
      request(app).get('/api/dashboard/summary').query({ startDate: yesterday, endDate: yesterday })
    );
    expect(res.status).toBe(200);
    expect(res.body.totalOrdersCount).toBe(0);
    expect(res.body.grossSales).toBe(0);
    expect(res.body.totalExpenses).toBe(0);
  });

  it('excludes a cancelled (deleted) pending order from Gross Sales', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);

    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 506, seats: 2 });
    await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: 'x1', name: 'Item', price: 500, quantity: 1 }],
    });
    // Cancelling a pending order deletes it outright (see cancelTableOrder
    // in ordersController.js) rather than marking a status — either way, it
    // must not show up in the summary.
    await asOwner(request(app).delete(`/api/orders/table/${tableRes.body._id}`)).send({ reason: 'customer left' });

    const res = await asOwner(request(app).get('/api/dashboard/summary'));
    expect(res.body.totalOrdersCount).toBe(0);
    expect(res.body.grossSales).toBe(0);
  });

  it('rejects a Waiter (no dash permission by default) and allows a Manager', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const waiterRes = await request(app).get('/api/dashboard/summary').set('Authorization', `Bearer ${waiterToken}`);
    expect(waiterRes.status).toBe(403);

    const { token: managerToken, locationId } = await createAuthedUser(app, { role: 'Manager' });
    const managerRes = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${managerToken}`)
      .set('X-Location-Id', locationId);
    expect(managerRes.status).toBe(200);
  });
});

// Gross Sales / Paid Revenue / Gross Profit are cash-basis: built from each
// order's individual payment events, not the order's creation date. These
// tests specifically cover credit orders, which the tests above never
// exercised (they all used a direct payOrder).
describe('dashboard summary — cash-basis credit payments', () => {
  it('a fresh credit order with no payment yet contributes nothing to Gross Sales, but still counts as an order', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);
    await asOwner(request(app).patch('/api/restaurant')).send({ taxRatePercent: 0 });

    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 601, seats: 2 });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: 'x1', name: 'Item', price: 200, quantity: 1 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/credit`)).send({
      customerName: 'Unpaid Customer',
      customerPhone: '9800000001',
    });

    const res = await asOwner(request(app).get('/api/dashboard/summary'));
    expect(res.body.grossSales).toBe(0);
    expect(res.body.netPaidSales).toBe(0);
    expect(res.body.totalOrdersCount).toBe(1);
    expect(res.body.creditOwed).toBe(200);
  });

  it('a partial credit payment shows up in Gross Sales immediately, but not in Paid Revenue', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);
    await asOwner(request(app).patch('/api/restaurant')).send({ taxRatePercent: 0 });

    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 602, seats: 2 });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: 'x1', name: 'Item', price: 200, quantity: 1 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/credit`)).send({
      customerName: 'Partial Payer',
      customerPhone: '9800000002',
    });
    await asOwner(request(app).post('/api/orders/credit/partial-pay')).send({
      customerName: 'Partial Payer',
      customerPhone: '9800000002',
      amount: 25,
    });

    const res = await asOwner(request(app).get('/api/dashboard/summary'));
    expect(res.body.grossSales).toBe(25); // only what's actually been paid so far
    expect(res.body.netPaidSales).toBe(0); // credit payments aren't "direct" revenue
    expect(res.body.creditOwed).toBe(175); // 200 - 25
  });

  it('splits a credit order paid across two different days into the correct date ranges', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);
    await asOwner(request(app).patch('/api/restaurant')).send({ taxRatePercent: 0 });

    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 603, seats: 2 });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: 'x1', name: 'Item', price: 200, quantity: 1 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/credit`)).send({
      customerName: 'Two Day Payer',
      customerPhone: '9800000003',
    });
    await asOwner(request(app).post('/api/orders/credit/partial-pay')).send({
      customerName: 'Two Day Payer',
      customerPhone: '9800000003',
      amount: 50,
    });

    // Backdate the order itself, and its first payment, to yesterday —
    // simulating "ate on credit yesterday, paid 50 of it yesterday too" —
    // directly at the model layer, the same way recipeCosting.test.js
    // reproduces a dangling reference. A payment can never actually predate
    // its own order in real usage, so the order's createdAt has to move
    // back along with the payment for this to be a realistic scenario.
    // Uses a raw updateOne (not fetch + .save()) because Mongoose's
    // `timestamps: true` re-stamps createdAt on every .save(), silently
    // discarding a manual edit to it.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await Order.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(saved.body._id) },
      { $set: { createdAt: yesterday, 'paymentHistory.0.createdAt': yesterday } }
    );

    // Pay the rest today.
    await asOwner(request(app).post('/api/orders/credit/full-settle')).send({
      customerName: 'Two Day Payer',
      customerPhone: '9800000003',
    });

    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const todayStr = new Date().toISOString().slice(0, 10);

    const yesterdayRes = await asOwner(
      request(app).get('/api/dashboard/summary').query({ startDate: yesterdayStr, endDate: yesterdayStr })
    );
    expect(yesterdayRes.body.grossSales).toBe(50);

    const todayRes = await asOwner(
      request(app).get('/api/dashboard/summary').query({ startDate: todayStr, endDate: todayStr })
    );
    expect(todayRes.body.grossSales).toBe(150);

    const allTimeRes = await asOwner(request(app).get('/api/dashboard/summary'));
    expect(allTimeRes.body.grossSales).toBe(200);
    expect(allTimeRes.body.creditOwed).toBe(0); // fully settled
  });

  it('Credit Owed is an all-time snapshot, unaffected by the date range filter', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);
    await asOwner(request(app).patch('/api/restaurant')).send({ taxRatePercent: 0 });

    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 604, seats: 2 });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: 'x1', name: 'Item', price: 90, quantity: 1 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/credit`)).send({
      customerName: 'Snapshot Customer',
      customerPhone: '9800000004',
    });

    // A date range that excludes today entirely — the order was created
    // (and is still outstanding) today, but Credit Owed must still show it.
    const longAgo = '2020-01-01';
    const res = await asOwner(
      request(app).get('/api/dashboard/summary').query({ startDate: longAgo, endDate: longAgo })
    );
    expect(res.body.totalOrdersCount).toBe(0); // period count correctly excludes it
    expect(res.body.creditOwed).toBe(90); // but the balance snapshot still includes it
  });
});
