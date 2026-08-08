import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';

let app;
let teardown;
let asOwner;
let roleIdByName;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const { token, locationId } = await createAuthedUser(app);
  asOwner = authedRequest(token, locationId);

  const rolesRes = await asOwner(request(app).get('/api/roles'));
  roleIdByName = new Map(rolesRes.body.map((r) => [r.name, r._id]));
}, 60000);

afterAll(async () => {
  await teardown();
});

async function latestAuditAction() {
  const res = await asOwner(request(app).get('/api/audit-log?limit=1'));
  return res.body[0]?.action;
}

describe('audit log', () => {
  it('rejects a non-Owner from viewing the audit log', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app).get('/api/audit-log').set('Authorization', `Bearer ${waiterToken}`);
    expect(res.status).toBe(403);
  });

  it('logs a staff invite, role change, and removal', async () => {
    const inviteRes = await asOwner(request(app).post('/api/staff/invite')).send({
      name: 'Audit Waiter',
      email: 'audit-waiter@example.com',
      roleId: roleIdByName.get('Waiter'),
    });
    expect(await latestAuditAction()).toMatch(/invited Audit Waiter as Waiter/);

    const roleRes = await asOwner(
      request(app).patch(`/api/staff/${inviteRes.body.id}/role`)
    ).send({ roleId: roleIdByName.get('Manager') });
    expect(roleRes.status).toBe(200);
    expect(await latestAuditAction()).toMatch(/changed Audit Waiter's role from Waiter to Manager/);

    await asOwner(request(app).delete(`/api/staff/${inviteRes.body.id}`));
    expect(await latestAuditAction()).toMatch(/removed Audit Waiter \(Manager\) from the restaurant/);
  });

  it('logs deleting a table, a category, and a menu item', async () => {
    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 777, seats: 2 });
    await asOwner(request(app).delete(`/api/tables/${tableRes.body._id}`));
    expect(await latestAuditAction()).toBe('deleted Table #777');

    await asOwner(request(app).post('/api/categories')).send({ name: 'Audit Test Category' });
    await asOwner(request(app).delete(`/api/categories/${encodeURIComponent('Audit Test Category')}`));
    expect(await latestAuditAction()).toBe('deleted category "Audit Test Category"');

    const menuRes = await asOwner(request(app).post('/api/menu')).send({
      name: 'Audit Test Dish',
      category: 'Main Course',
      price: 100,
    });
    await asOwner(request(app).delete(`/api/menu/${menuRes.body._id}`));
    expect(await latestAuditAction()).toBe('deleted menu item "Audit Test Dish"');
  });

  it('logs cancelling a pending order and deleting an order', async () => {
    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 778, seats: 2 });
    const menuRes = await asOwner(request(app).post('/api/menu')).send({
      name: 'Audit Order Dish',
      category: 'Main Course',
      price: 50,
    });

    await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: menuRes.body._id, name: 'Audit Order Dish', price: 50, quantity: 1 }],
    });
    await asOwner(request(app).delete(`/api/orders/table/${tableRes.body._id}`));
    expect(await latestAuditAction()).toBe('cancelled the pending order for Table #778');

    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: menuRes.body._id, name: 'Audit Order Dish', price: 50, quantity: 1 }],
    });
    await asOwner(request(app).delete(`/api/orders/${saved.body._id}`));
    expect(await latestAuditAction()).toMatch(/^deleted order #/);
  });

  it('logs a partial credit payment and a full credit settlement', async () => {
    const tableRes = await asOwner(request(app).post('/api/tables')).send({ number: 779, seats: 2 });
    const menuRes = await asOwner(request(app).post('/api/menu')).send({
      name: 'Audit Credit Dish',
      category: 'Main Course',
      price: 200,
    });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId: menuRes.body._id, name: 'Audit Credit Dish', price: 200, quantity: 1 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/credit`)).send({
      customerName: 'Audit Customer',
      customerPhone: '9800000000',
    });

    await asOwner(request(app).post('/api/orders/credit/partial-pay')).send({
      customerPhone: '9800000000',
      customerName: 'Audit Customer',
      amount: 50,
    });
    expect(await latestAuditAction()).toMatch(/recorded a partial payment of Rs\. 50 for Audit Customer/);

    await asOwner(request(app).post('/api/orders/credit/full-settle')).send({
      customerPhone: '9800000000',
      customerName: 'Audit Customer',
    });
    expect(await latestAuditAction()).toMatch(/settled a full credit balance of Rs\. \d+ for Audit Customer/);
  });

  it('logs each purchase order status transition', async () => {
    const invRes = await asOwner(request(app).post('/api/inventory')).send({
      name: 'Audit PO Ingredient',
      totalQuantity: 5,
      unit: 'kg',
      costPerUnit: 10,
    });
    const vendorRes = await asOwner(request(app).post('/api/procurement/vendors')).send({
      name: 'Audit Vendor',
      category: 'Produce',
    });
    const poRes = await asOwner(request(app).post('/api/procurement/purchase-orders')).send({
      vendorId: vendorRes.body._id,
      items: [{ inventoryItemId: invRes.body._id, quantity: 2, unitCost: 10 }],
    });

    await asOwner(request(app).patch(`/api/procurement/purchase-orders/${poRes.body._id}/status`)).send({
      status: 'sent',
    });
    expect(await latestAuditAction()).toMatch(/sent purchase order to Audit Vendor/);

    await asOwner(request(app).patch(`/api/procurement/purchase-orders/${poRes.body._id}/status`)).send({
      status: 'received',
    });
    expect(await latestAuditAction()).toMatch(/received purchase order from Audit Vendor/);

    await asOwner(request(app).patch(`/api/procurement/purchase-orders/${poRes.body._id}/status`)).send({
      status: 'reconciled',
    });
    expect(await latestAuditAction()).toMatch(/reconciled purchase order from Audit Vendor/);
  });

  it('scopes audit log entries per restaurant', async () => {
    const { token: otherOwnerToken } = await createAuthedUser(app);
    const otherRes = await request(app).get('/api/audit-log').set('Authorization', `Bearer ${otherOwnerToken}`);
    expect(otherRes.status).toBe(200);
    expect(otherRes.body.length).toBe(0);

    const ownRes = await asOwner(request(app).get('/api/audit-log'));
    expect(ownRes.body.length).toBeGreaterThan(0);
  });

  it('filters by a text search on the action description', async () => {
    const res = await asOwner(request(app).get('/api/audit-log?q=Audit Vendor'));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((e) => e.action.includes('Audit Vendor'))).toBe(true);
  });

  it('treats regex special characters in the search term as literal text', async () => {
    const res = await asOwner(request(app).get('/api/audit-log?q=Rs. 50 ('));
    expect(res.status).toBe(200); // would 500 if the raw string were passed straight into $regex
  });

  it('filters by actor email', async () => {
    const staffRes = await asOwner(request(app).get('/api/staff'));
    const ownerEmail = staffRes.body.find((s) => s.role === 'Owner').email;

    const res = await asOwner(request(app).get(`/api/audit-log?actorEmail=${encodeURIComponent(ownerEmail)}`));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((e) => e.actorEmail === ownerEmail)).toBe(true);
  });

  it('filters by a date range, excluding entries outside it', async () => {
    const farFuture = '2099-01-01';
    const res = await asOwner(request(app).get(`/api/audit-log?startDate=${farFuture}&endDate=${farFuture}`));
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);

    const today = new Date().toISOString().slice(0, 10);
    const todayRes = await asOwner(request(app).get(`/api/audit-log?startDate=${today}&endDate=${today}`));
    expect(todayRes.body.length).toBeGreaterThan(0);
  });
});
