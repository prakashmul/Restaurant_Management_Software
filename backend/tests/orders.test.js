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

  it('pays an order even when stock is insufficient, taking it negative', async () => {
    const { tableId, menuItemId, inventoryItemId } = await setupOrderFixtures(104, 1); // only 1 unit in stock

    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }], // needs 2 units, only 1 available
    });
    const orderId = saved.body._id;

    // Stock is a low-stock reminder, not a gate — payment must go through
    // and stock deducts anyway, since staff can substitute in practice.
    const payRes = await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });
    expect(payRes.status).toBe(200);
    expect(payRes.body.order.status).toBe('paid');

    const inv = payRes.body.inventory.find((i) => i._id === inventoryItemId);
    expect(inv.totalQuantity).toBe(-1); // 1 - 2
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
  it('rejects a role without stock.history permission (Waiter) from the stock history endpoint', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app).get('/api/inventory/history').set('Authorization', `Bearer ${waiterToken}`);
    expect(res.status).toBe(403);
  });

  it('allows a Manager (who has stock.history by default) to access the stock history endpoint', async () => {
    const { token: managerToken, locationId } = await createAuthedUser(app, { role: 'Manager' });
    const res = await request(app)
      .get('/api/inventory/history')
      .set('Authorization', `Bearer ${managerToken}`)
      .set('X-Location-Id', locationId);
    expect(res.status).toBe(200);
  });

  it('allows an Owner to access the stock history endpoint', async () => {
    const res = await auth(request(app).get('/api/inventory/history'));
    expect(res.status).toBe(200);
  });
});

describe('discounts', () => {
  it('rejects a role without orders.discount (Waiter) from applying a discount', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(200, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }], // subtotal 20
    });

    const { token: waiterToken, locationId } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .patch(`/api/orders/${saved.body._id}/discount`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .set('X-Location-Id', locationId)
      .send({ type: 'flat', value: 5 });
    expect(res.status).toBe(403);
  });

  it('applies a flat discount before tax and recomputes total/remainingBalance', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(201, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }], // subtotal 20
    });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({
      type: 'flat',
      value: 5,
      reason: 'Regular customer',
    });
    expect(res.status).toBe(200);
    expect(res.body.discount.amount).toBe(5);
    expect(res.body.discount.reason).toBe('Regular customer');
    expect(res.body.tax).toBeCloseTo(15 * 0.08, 5); // (20 - 5) * 8%
    expect(res.body.total).toBeCloseTo(15 + 15 * 0.08, 5);
    expect(res.body.remainingBalance).toBeCloseTo(res.body.total, 5);
  });

  it('applies a percent discount and caps a flat discount at the subtotal', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(202, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }], // subtotal 10
    });

    const percentRes = await auth(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({
      type: 'percent',
      value: 10,
    });
    expect(percentRes.body.discount.amount).toBeCloseTo(1, 5); // 10% of 10

    const overshootRes = await auth(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({
      type: 'flat',
      value: 999,
    });
    expect(overshootRes.body.discount.amount).toBe(10); // capped at subtotal
    expect(overshootRes.body.total).toBeCloseTo(0, 5); // fully discounted, no tax owed
  });

  it('rejects a percent discount over 100%', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(203, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({
      type: 'percent',
      value: 150,
    });
    expect(res.status).toBe(400);
  });

  it('removes a discount by sending type: null', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(204, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }],
    });
    await auth(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({ type: 'flat', value: 5 });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({ type: null });
    expect(res.status).toBe(200);
    expect(res.body.discount.type).toBeNull();
    expect(res.body.discount.amount).toBe(0);
    expect(res.body.total).toBeCloseTo(20 * 1.08, 5);
  });

  it('refuses to discount an order that is no longer pending', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(205, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    await auth(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({
      type: 'flat',
      value: 1,
    });
    expect(res.status).toBe(400);
  });
});

describe('void reason capture', () => {
  it('records the reason in the audit log when cancelling a pending table order', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(300, 10);
    await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const cancelRes = await auth(request(app).delete(`/api/orders/table/${tableId}`)).send({
      reason: 'Guest changed their mind',
    });
    expect(cancelRes.status).toBe(200);

    const auditRes = await auth(request(app).get('/api/audit-log')).query({ q: 'Guest changed their mind' });
    expect(auditRes.body.length).toBeGreaterThan(0);
    expect(auditRes.body[0].action).toContain('Guest changed their mind');
  });

  it('records the reason in the audit log when deleting an order record', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(301, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    await auth(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const deleteRes = await auth(request(app).delete(`/api/orders/${saved.body._id}`)).send({
      reason: 'Duplicate record',
    });
    expect(deleteRes.status).toBe(200);

    const auditRes = await auth(request(app).get('/api/audit-log')).query({ q: 'Duplicate record' });
    expect(auditRes.body.length).toBeGreaterThan(0);
    expect(auditRes.body[0].action).toContain('Duplicate record');
  });

  it('cancelling without a reason still succeeds (reason is optional at the API level)', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(302, 10);
    await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const cancelRes = await auth(request(app).delete(`/api/orders/table/${tableId}`)).send({});
    expect(cancelRes.status).toBe(200);
  });
});

describe('tips', () => {
  it('rejects a role without orders.tip (Kitchen) from applying a tip', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(400, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }], // subtotal 20
    });

    const { token: kitchenToken, locationId } = await createAuthedUser(app, { role: 'Kitchen' });
    const res = await request(app)
      .patch(`/api/orders/${saved.body._id}/tip`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .set('X-Location-Id', locationId)
      .send({ type: 'flat', value: 5 });
    expect(res.status).toBe(403);
  });

  it('applies a flat tip after tax without taxing the tip itself', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(401, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }], // subtotal 20
    });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/tip`)).send({
      type: 'flat',
      value: 5,
    });
    expect(res.status).toBe(200);
    expect(res.body.tip.amount).toBe(5);
    expect(res.body.tax).toBeCloseTo(20 * 0.08, 5); // tip doesn't affect the taxable base
    expect(res.body.total).toBeCloseTo(20 + 20 * 0.08 + 5, 5);
    expect(res.body.remainingBalance).toBeCloseTo(res.body.total, 5);
  });

  it('applies a percent tip based on the discounted (taxable) subtotal', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(402, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }], // subtotal 20
    });
    await auth(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({ type: 'flat', value: 5 }); // taxable base now 15

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/tip`)).send({
      type: 'percent',
      value: 10,
    });
    expect(res.body.tip.amount).toBeCloseTo(1.5, 5); // 10% of 15
    expect(res.body.tax).toBeCloseTo(15 * 0.08, 5);
    expect(res.body.total).toBeCloseTo(15 + 15 * 0.08 + 1.5, 5);
  });

  it('removes a tip by sending type: null', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(403, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }],
    });
    await auth(request(app).patch(`/api/orders/${saved.body._id}/tip`)).send({ type: 'flat', value: 5 });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/tip`)).send({ type: null });
    expect(res.status).toBe(200);
    expect(res.body.tip.type).toBeNull();
    expect(res.body.tip.amount).toBe(0);
    expect(res.body.total).toBeCloseTo(20 * 1.08, 5);
  });

  it('refuses to tip an order that is no longer pending', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(404, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    await auth(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/tip`)).send({
      type: 'flat',
      value: 1,
    });
    expect(res.status).toBe(400);
  });

  it('re-saving items on a table preserves an already-applied discount and tip', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(405, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }], // subtotal 20
    });
    await auth(request(app).patch(`/api/orders/${saved.body._id}/discount`)).send({ type: 'flat', value: 5 });
    await auth(request(app).patch(`/api/orders/${saved.body._id}/tip`)).send({ type: 'percent', value: 10 }); // 10% of 15 = 1.5

    // Add another unit of the same dish — subtotal becomes 30.
    const resaved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 3 }],
    });

    expect(resaved.body.discount.amount).toBe(5); // flat discount unchanged
    const expectedTaxableBase = 30 - 5; // 25
    expect(resaved.body.tip.amount).toBeCloseTo(expectedTaxableBase * 0.1, 5); // percent tip re-derived
    expect(resaved.body.tax).toBeCloseTo(expectedTaxableBase * 0.08, 5);
    expect(resaved.body.total).toBeCloseTo(expectedTaxableBase + expectedTaxableBase * 0.08 + expectedTaxableBase * 0.1, 5);
  });
});

describe('CSV export', () => {
  it('rejects a role without settings.restaurant (Manager) from exporting', async () => {
    const { token: managerToken, locationId } = await createAuthedUser(app, { role: 'Manager' });
    const res = await request(app)
      .get('/api/orders/export/csv')
      .set('Authorization', `Bearer ${managerToken}`)
      .set('X-Location-Id', locationId);
    expect(res.status).toBe(403);
  });

  it('exports paid orders as CSV with the expected columns and totals', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(500, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }], // subtotal 20
    });
    await auth(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const res = await auth(request(app).get('/api/orders/export/csv'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Date,Order ID,Status,Payment Method,Customer,Subtotal,Discount,Tax,Tip,Total');
    expect(res.text).toContain('20.00');
    expect(res.text).toContain('paid');
  });

  it('excludes pending orders from the export', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(501, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const res = await auth(request(app).get('/api/orders/export/csv'));
    expect(res.text).not.toContain(saved.body._id.slice(-6));
  });
});

describe('refunds', () => {
  it('rejects a role without orders.refund (Waiter) from refunding', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(600, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    await auth(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .patch(`/api/orders/${saved.body._id}/refund`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ reason: 'Customer complaint' });
    expect(res.status).toBe(403);
  });

  it('rejects refunding a still-pending order', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(601, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/refund`)).send({
      reason: 'Never paid',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a refund with no reason', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(602, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    await auth(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/refund`)).send({ reason: '' });
    expect(res.status).toBe(400);
  });

  it('refunds a paid order: restores stock, zeroes the balance, and records refund history', async () => {
    const { tableId, menuItemId, inventoryItemId } = await setupOrderFixtures(603, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 2 }], // needs 2*2=4 units
    });
    const orderId = saved.body._id;

    const payRes = await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });
    const paidInv = payRes.body.inventory.find((i) => i._id === inventoryItemId);
    expect(paidInv.totalQuantity).toBe(6); // 10 - 4

    const refundRes = await auth(request(app).patch(`/api/orders/${orderId}/refund`)).send({
      reason: 'Customer sent it back',
    });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.status).toBe('refunded');
    expect(refundRes.body.remainingBalance).toBe(0);
    expect(refundRes.body.refundHistory.length).toBe(1);
    expect(refundRes.body.refundHistory[0].reason).toBe('Customer sent it back');

    const invRes = await auth(request(app).get('/api/inventory'));
    const inv = invRes.body.find((i) => i._id === inventoryItemId);
    expect(inv.totalQuantity).toBe(10); // fully restored
  });

  it('rejects refunding an order that was already refunded', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(604, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    const orderId = saved.body._id;
    await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });
    await auth(request(app).patch(`/api/orders/${orderId}/refund`)).send({ reason: 'First refund' });

    const res = await auth(request(app).patch(`/api/orders/${orderId}/refund`)).send({ reason: 'Second attempt' });
    expect(res.status).toBe(400);
  });

  it('refunding a credit order drops it out of the credit ledger', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(605, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    const orderId = saved.body._id;
    await auth(request(app).post(`/api/orders/${orderId}/credit`)).send({
      customerName: 'Refund Ledger Test',
      customerPhone: '9800000605',
    });

    const beforeLedger = await auth(request(app).get('/api/credits'));
    expect(beforeLedger.body.some((c) => c.phone === '9800000605')).toBe(true);

    const refundRes = await auth(request(app).patch(`/api/orders/${orderId}/refund`)).send({
      reason: 'Order never fulfilled',
    });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.status).toBe('refunded');

    const afterLedger = await auth(request(app).get('/api/credits'));
    expect(afterLedger.body.some((c) => c.phone === '9800000605')).toBe(false);
  });

  it('accepts a partial refund amount: order stays active, stock is not restored yet', async () => {
    const { tableId, menuItemId, inventoryItemId } = await setupOrderFixtures(606, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 100, quantity: 1 }],
    });
    const orderId = saved.body._id;
    await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });

    const refundRes = await auth(request(app).patch(`/api/orders/${orderId}/refund`)).send({
      reason: 'Goodwill discount',
      amount: 20,
    });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.status).toBe('paid');
    expect(refundRes.body.refundHistory.length).toBe(1);
    expect(refundRes.body.refundHistory[0].amount).toBe(20);

    const invRes = await auth(request(app).get('/api/inventory'));
    const inv = invRes.body.find((i) => i._id === inventoryItemId);
    expect(inv.totalQuantity).toBe(8); // 10 - 2 deducted at payment, untouched by the partial refund
  });

  it('completing the remaining balance via a second partial refund fully refunds the order', async () => {
    const { tableId, menuItemId, inventoryItemId } = await setupOrderFixtures(607, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 100, quantity: 1 }],
    });
    const orderId = saved.body._id;
    const payRes = await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });
    const total = payRes.body.order.total;

    await auth(request(app).patch(`/api/orders/${orderId}/refund`)).send({ reason: 'Partial 1', amount: 20 });
    const secondRefund = await auth(request(app).patch(`/api/orders/${orderId}/refund`)).send({
      reason: 'Rest of it',
      amount: total - 20,
    });

    expect(secondRefund.status).toBe(200);
    expect(secondRefund.body.status).toBe('refunded');
    expect(secondRefund.body.remainingBalance).toBe(0);
    expect(secondRefund.body.refundHistory.length).toBe(2);

    const invRes = await auth(request(app).get('/api/inventory'));
    const inv = invRes.body.find((i) => i._id === inventoryItemId);
    expect(inv.totalQuantity).toBe(10); // fully restored once cumulative refunds reach the total
  });

  it('rejects a refund amount greater than what is still refundable', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(608, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 100, quantity: 1 }],
    });
    const orderId = saved.body._id;
    await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });

    const res = await auth(request(app).patch(`/api/orders/${orderId}/refund`)).send({
      reason: 'Too much',
      amount: 999999,
    });
    expect(res.status).toBe(400);
  });
});

describe('kitchen display', () => {
  it('lists only pending orders, oldest first', async () => {
    const first = await setupOrderFixtures(700, 10);
    const firstSaved = await auth(request(app).post('/api/orders/save')).send({
      tableId: first.tableId,
      items: [{ menuItemId: first.menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const second = await setupOrderFixtures(701, 10);
    const secondSaved = await auth(request(app).post('/api/orders/save')).send({
      tableId: second.tableId,
      items: [{ menuItemId: second.menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    // Paid, so it should never show up on the kitchen board.
    const third = await setupOrderFixtures(702, 10);
    const thirdSaved = await auth(request(app).post('/api/orders/save')).send({
      tableId: third.tableId,
      items: [{ menuItemId: third.menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    await auth(request(app).post(`/api/orders/${thirdSaved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const res = await auth(request(app).get('/api/orders/kitchen'));
    expect(res.status).toBe(200);
    const ids = res.body.map((o) => o._id);
    expect(ids).not.toContain(thirdSaved.body._id);
    const firstIndex = ids.indexOf(firstSaved.body._id);
    const secondIndex = ids.indexOf(secondSaved.body._id);
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it('toggles bumped on a line item of a pending order', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(703, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    const orderId = saved.body._id;
    const itemId = saved.body.items[0]._id;
    expect(saved.body.items[0].bumped).toBe(false);

    const bumpedRes = await auth(request(app).patch(`/api/orders/${orderId}/items/${itemId}/bump`));
    expect(bumpedRes.status).toBe(200);
    expect(bumpedRes.body.items[0].bumped).toBe(true);

    const unbumpedRes = await auth(request(app).patch(`/api/orders/${orderId}/items/${itemId}/bump`));
    expect(unbumpedRes.status).toBe(200);
    expect(unbumpedRes.body.items[0].bumped).toBe(false);
  });

  it('rejects bumping an item on a non-pending order', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(704, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    const orderId = saved.body._id;
    const itemId = saved.body.items[0]._id;
    await auth(request(app).post(`/api/orders/${orderId}/pay`)).send({ paymentMethod: 'cash' });

    const res = await auth(request(app).patch(`/api/orders/${orderId}/items/${itemId}/bump`));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a nonexistent item id', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(705, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    const orderId = saved.body._id;

    const res = await auth(
      request(app).patch(`/api/orders/${orderId}/items/6a75f00000000000000000aa/bump`)
    );
    expect(res.status).toBe(404);
  });

  it('preserves a bumped item\'s status when the order is re-saved with an added item', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(708, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    const orderId = saved.body._id;
    const itemId = saved.body.items[0]._id;

    const bumped = await auth(request(app).patch(`/api/orders/${orderId}/items/${itemId}/bump`));
    expect(bumped.body.items[0].bumped).toBe(true);

    // Re-save with the same (now-bumped) item plus a brand-new one, exactly
    // like the client cart does when a waiter adds more items to a table
    // that already has a ticket in progress.
    const resaved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [
        { ...bumped.body.items[0], menuItemId },
        { menuItemId, name: 'Dish', price: 10, quantity: 1 },
      ],
    });
    expect(resaved.status).toBe(200);
    expect(resaved.body.items[0].bumped).toBe(true);
    expect(resaved.body.items[1].bumped).toBe(false);
  });
});

describe('loyalty points', () => {
  it('attaches a customer to a pending order', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(709, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/customer`)).send({
      customerName: 'Loyalty Customer',
      customerPhone: '9800000709',
    });
    expect(res.status).toBe(200);
    expect(res.body.customerPhone).toBe('9800000709');
    expect(res.body.customerId).toBeTruthy();
  });

  it('rejects attaching a customer to a non-pending order', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(710, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });
    await auth(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/customer`)).send({
      customerName: 'X',
      customerPhone: '9800000710',
    });
    expect(res.status).toBe(400);
  });

  it('rejects redeeming points before a customer is attached', async () => {
    const { tableId, menuItemId } = await setupOrderFixtures(711, 10);
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId, name: 'Dish', price: 10, quantity: 1 }],
    });

    const res = await auth(request(app).patch(`/api/orders/${saved.body._id}/redeem-points`)).send({ points: 1 });
    expect(res.status).toBe(400);
  });

  it('earns points on lifetime spend and lets them be redeemed on a later order', async () => {
    const phone = '9800000712';

    // Order #1: subtotal 100 -> total 108 at the default 8% tax rate, paid
    // in full. Default loyalty rate is 1 point per Rs. 100 spent.
    const first = await setupOrderFixtures(712, 10);
    const savedFirst = await auth(request(app).post('/api/orders/save')).send({
      tableId: first.tableId,
      items: [{ menuItemId: first.menuItemId, name: 'Dish', price: 100, quantity: 1 }],
    });
    await auth(request(app).patch(`/api/orders/${savedFirst.body._id}/customer`)).send({
      customerName: 'Points Earner',
      customerPhone: phone,
    });
    await auth(request(app).post(`/api/orders/${savedFirst.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const customersRes = await auth(request(app).get('/api/customers'));
    const customer = customersRes.body.find((c) => c.phone === phone);
    expect(customer).toBeTruthy();
    expect(customer.lifetimeSpend).toBeCloseTo(108, 1);
    expect(customer.pointsEarned).toBe(1); // floor(108 * 0.01)
    expect(customer.pointsBalance).toBe(1);

    // Order #2: redeem the 1 earned point (worth Rs. 1) against a new order.
    const second = await setupOrderFixtures(713, 10);
    const savedSecond = await auth(request(app).post('/api/orders/save')).send({
      tableId: second.tableId,
      items: [{ menuItemId: second.menuItemId, name: 'Dish', price: 50, quantity: 1 }],
    });
    await auth(request(app).patch(`/api/orders/${savedSecond.body._id}/customer`)).send({
      customerName: 'Points Earner',
      customerPhone: phone,
    });

    const tooMany = await auth(
      request(app).patch(`/api/orders/${savedSecond.body._id}/redeem-points`)
    ).send({ points: 5 });
    expect(tooMany.status).toBe(400);

    const redeemed = await auth(
      request(app).patch(`/api/orders/${savedSecond.body._id}/redeem-points`)
    ).send({ points: 1 });
    expect(redeemed.status).toBe(200);
    expect(redeemed.body.order.discount.amount).toBe(1);
    expect(redeemed.body.pointsRemaining).toBe(0);

    // A manual discount and a points redemption can't coexist on one order.
    const doubleRedeem = await auth(
      request(app).patch(`/api/orders/${savedSecond.body._id}/redeem-points`)
    ).send({ points: 1 });
    expect(doubleRedeem.status).toBe(400);

    await auth(request(app).post(`/api/orders/${savedSecond.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const afterRes = await auth(request(app).get('/api/customers'));
    const afterCustomer = afterRes.body.find((c) => c.phone === phone);
    expect(afterCustomer.pointsRedeemed).toBe(1);
    // Rs. 108 + Rs. 52.92 spent so far -> floor(1.6092) = 1 point earned total, 1 already redeemed.
    expect(afterCustomer.pointsBalance).toBe(0);
  });
});

describe('switch table', () => {
  // Lighter than setupOrderFixtures — these tests never pay an order (so
  // never trigger stock deduction), meaning a real Inventory/MenuItem isn't
  // needed, just a table and an arbitrary item payload. Keeps this block's
  // request count down against the shared per-IP rate limiter this file's
  // other ~46 tests already exercise.
  async function createTable(number) {
    const res = await auth(request(app).post('/api/tables')).send({ number, seats: 2 });
    return res.body._id;
  }
  const fakeItem = (label) => ({ menuItemId: `switch-test-${label}`, name: 'Dish', price: 10, quantity: 1 });

  it('moves the entire pending order to the destination table and flips both table statuses, with no reason required', async () => {
    const sourceTableId = await createTable(900);
    const destinationTableId = await createTable(901);

    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId: sourceTableId,
      items: [fakeItem('a')],
    });
    await auth(request(app).patch(`/api/orders/${saved.body._id}/tip`)).send({ type: 'flat', value: 5 });

    // No `reason` field sent at all — switching a table is routine floor
    // management, unlike void/cancel which requires one.
    const switchRes = await auth(
      request(app).patch(`/api/orders/table/${sourceTableId}/switch`)
    ).send({ destinationTableId });
    expect(switchRes.status).toBe(200);
    expect(switchRes.body.order.tableId).toBe(destinationTableId);
    expect(switchRes.body.order.tip.amount).toBe(5);
    expect(switchRes.body.order.items.length).toBe(1);

    const tablesRes = await auth(request(app).get('/api/tables'));
    const sourceTable = tablesRes.body.find((t) => t._id === sourceTableId);
    const destinationTable = tablesRes.body.find((t) => t._id === destinationTableId);
    expect(sourceTable.status).toBe('available');
    expect(destinationTable.status).toBe('occupied');
  });

  it('fails when the destination table already has a pending order', async () => {
    const sourceTableId = await createTable(902);
    const destinationTableId = await createTable(903);

    await auth(request(app).post('/api/orders/save')).send({ tableId: sourceTableId, items: [fakeItem('b')] });
    await auth(request(app).post('/api/orders/save')).send({ tableId: destinationTableId, items: [fakeItem('c')] });

    const res = await auth(
      request(app).patch(`/api/orders/table/${sourceTableId}/switch`)
    ).send({ destinationTableId });
    expect(res.status).toBe(400);
  });

  it('fails when the source table has no pending order', async () => {
    const sourceTableId = await createTable(904);
    const destinationTableId = await createTable(905);

    const res = await auth(
      request(app).patch(`/api/orders/table/${sourceTableId}/switch`)
    ).send({ destinationTableId });
    expect(res.status).toBe(400);
  });

  it('fails when source and destination are the same table', async () => {
    const tableId = await createTable(906);
    await auth(request(app).post('/api/orders/save')).send({ tableId, items: [fakeItem('d')] });

    const res = await auth(
      request(app).patch(`/api/orders/table/${tableId}/switch`)
    ).send({ destinationTableId: tableId });
    expect(res.status).toBe(400);
  });

  it('rejects a role without orders.edit (Kitchen) from switching tables', async () => {
    const tableId = await createTable(907);
    await auth(request(app).post('/api/orders/save')).send({ tableId, items: [fakeItem('e')] });
    const destinationTableId = await createTable(908);

    const { token: kitchenToken, locationId } = await createAuthedUser(app, { role: 'Kitchen' });
    const res = await request(app)
      .patch(`/api/orders/table/${tableId}/switch`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .set('X-Location-Id', locationId)
      .send({ destinationTableId });
    expect(res.status).toBe(403);
  });
});
