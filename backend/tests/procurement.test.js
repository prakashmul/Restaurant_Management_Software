import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';

let app;
let teardown;
let inventoryItemId;
let vendorId;
let asOwner;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const { token, locationId } = await createAuthedUser(app);
  asOwner = authedRequest(token, locationId);

  const invRes = await asOwner(request(app).post('/api/inventory')).send({
    name: 'PO Test Ingredient',
    totalQuantity: 10,
    unit: 'kg',
    costPerUnit: 5,
  });
  inventoryItemId = invRes.body._id;
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('procurement', () => {
  it('rejects a non-Owner/Manager from creating a vendor', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .post('/api/procurement/vendors')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ name: 'Test Vendor', category: 'Meat' });
    expect(res.status).toBe(403);
  });

  it('creates a vendor', async () => {
    const res = await asOwner(request(app).post('/api/procurement/vendors')).send({
      name: 'Himalayan Butchery',
      category: 'Meat & Poultry',
    });
    expect(res.status).toBe(201);
    vendorId = res.body._id;
  });

  it('rejects a purchase order for a vendor that does not exist', async () => {
    const res = await asOwner(request(app).post('/api/procurement/purchase-orders')).send({
      vendorId: '000000000000000000000000',
      items: [{ inventoryItemId, quantity: 5, unitCost: 10 }],
    });
    expect(res.status).toBe(404);
  });

  it('creates a purchase order in draft status with a computed total', async () => {
    const res = await asOwner(request(app).post('/api/procurement/purchase-orders')).send({
      vendorId,
      items: [{ inventoryItemId, quantity: 5, unitCost: 10 }], // 5*10 = 50
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.totalAmount).toBe(50);
    expect(res.body.items[0].itemName).toBe('PO Test Ingredient');
  });

  it('rejects skipping a status (draft straight to received)', async () => {
    const listRes = await asOwner(request(app).get('/api/procurement/purchase-orders'));
    const po = listRes.body[0];

    const res = await asOwner(request(app).patch(`/api/procurement/purchase-orders/${po._id}/status`)).send({
      status: 'received',
    });
    expect(res.status).toBe(400);
  });

  it('advances draft -> sent, then receiving actually adds stock to inventory', async () => {
    const listRes = await asOwner(request(app).get('/api/procurement/purchase-orders'));
    const po = listRes.body[0];

    const sentRes = await asOwner(request(app).patch(`/api/procurement/purchase-orders/${po._id}/status`)).send({
      status: 'sent',
    });
    expect(sentRes.status).toBe(200);
    expect(sentRes.body.status).toBe('sent');

    const invBefore = await asOwner(request(app).get('/api/inventory'));
    const before = invBefore.body.find((i) => i._id === inventoryItemId).totalQuantity;

    const receivedRes = await asOwner(
      request(app).patch(`/api/procurement/purchase-orders/${po._id}/status`)
    ).send({ status: 'received' });
    expect(receivedRes.status).toBe(200);
    expect(receivedRes.body.status).toBe('received');
    expect(receivedRes.body.receivedAt).toBeTruthy();

    const invAfter = await asOwner(request(app).get('/api/inventory'));
    const after = invAfter.body.find((i) => i._id === inventoryItemId).totalQuantity;
    expect(after).toBe(before + 5); // the PO ordered 5kg

    const historyRes = await asOwner(request(app).get('/api/inventory/history'));
    const entry = historyRes.body.find((h) => h.description.includes('Received via PO'));
    expect(entry).toBeTruthy();
    expect(entry.quantity).toBe(5);
  });

  it('rejects deleting a purchase order that is no longer in draft status', async () => {
    const listRes = await asOwner(request(app).get('/api/procurement/purchase-orders'));
    const po = listRes.body[0];
    const res = await asOwner(request(app).delete(`/api/procurement/purchase-orders/${po._id}`));
    expect(res.status).toBe(400);
  });

  it('advances sent -> received is no longer allowed (already received), but received -> reconciled is', async () => {
    const listRes = await asOwner(request(app).get('/api/procurement/purchase-orders'));
    const po = listRes.body[0];

    const res = await asOwner(request(app).patch(`/api/procurement/purchase-orders/${po._id}/status`)).send({
      status: 'reconciled',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reconciled');

    const terminalRes = await asOwner(
      request(app).patch(`/api/procurement/purchase-orders/${po._id}/status`)
    ).send({ status: 'sent' });
    expect(terminalRes.status).toBe(400);
  });

  it('refuses to delete a vendor that has purchase order history', async () => {
    const res = await asOwner(request(app).delete(`/api/procurement/vendors/${vendorId}`));
    expect(res.status).toBe(400);
  });

  it('deletes a draft purchase order and allows deleting a vendor with no history', async () => {
    const createRes = await asOwner(request(app).post('/api/procurement/purchase-orders')).send({
      vendorId,
      items: [{ inventoryItemId, quantity: 1, unitCost: 1 }],
    });
    const deleteRes = await asOwner(request(app).delete(`/api/procurement/purchase-orders/${createRes.body._id}`));
    expect(deleteRes.status).toBe(200);

    const otherVendorRes = await asOwner(request(app).post('/api/procurement/vendors')).send({
      name: 'Unused Vendor',
      category: 'Dairy',
    });
    const deleteVendorRes = await asOwner(
      request(app).delete(`/api/procurement/vendors/${otherVendorRes.body._id}`)
    );
    expect(deleteVendorRes.status).toBe(200);
  });
});
