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

  it('surfaces the received purchase order in the ingredient\'s supplier price history', async () => {
    const res = await asOwner(request(app).get(`/api/inventory/${inventoryItemId}/price-history`));
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].vendorName).toBe('Himalayan Butchery');
    expect(res.body[0].unitCost).toBe(10);
    expect(res.body[0].quantity).toBe(5);
    expect(res.body[0].receivedAt).toBeTruthy();
  });

  it('does not include a still-draft purchase order in supplier price history', async () => {
    // Created and torn back down within this test so it doesn't shift which
    // PO later tests in this file find at listRes.body[0] (sorted newest-first).
    const draftRes = await asOwner(request(app).post('/api/procurement/purchase-orders')).send({
      vendorId,
      items: [{ inventoryItemId, quantity: 99, unitCost: 999 }],
    });

    const res = await asOwner(request(app).get(`/api/inventory/${inventoryItemId}/price-history`));
    expect(res.body.length).toBe(1); // still just the one already-received PO
    expect(res.body.every((entry) => entry.unitCost !== 999)).toBe(true);

    await asOwner(request(app).delete(`/api/procurement/purchase-orders/${draftRes.body._id}`));
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

describe('suggested purchase orders', () => {
  it('suggests a draft PO for a low-stock item with a preferred vendor and reorder quantity configured', async () => {
    const createRes = await asOwner(request(app).post('/api/inventory')).send({
      name: 'Suggestion Test Ingredient',
      totalQuantity: 2,
      unit: 'kg',
      costPerUnit: 3,
      lowStockThreshold: 10,
    });
    const itemId = createRes.body._id;

    await asOwner(request(app).patch(`/api/inventory/${itemId}`)).send({
      preferredVendorId: vendorId,
      reorderQuantity: 20,
    });

    const res = await asOwner(request(app).get('/api/procurement/suggested-orders'));
    expect(res.status).toBe(200);
    const suggestion = res.body.find((s) => s.vendorId === vendorId);
    expect(suggestion).toBeTruthy();
    const line = suggestion.items.find((i) => i.inventoryItemId === itemId);
    expect(line).toBeTruthy();
    expect(line.reorderQuantity).toBe(20);
    expect(line.currentQuantity).toBe(2);
  });

  it('excludes a low-stock item with no preferred vendor configured', async () => {
    const createRes = await asOwner(request(app).post('/api/inventory')).send({
      name: 'No Vendor Ingredient',
      totalQuantity: 1,
      unit: 'kg',
      costPerUnit: 1,
      lowStockThreshold: 5,
    });

    const res = await asOwner(request(app).get('/api/procurement/suggested-orders'));
    const found = res.body.some((s) => s.items.some((i) => i.inventoryItemId === createRes.body._id));
    expect(found).toBe(false);
  });

  it('excludes an item that is not actually low on stock', async () => {
    const createRes = await asOwner(request(app).post('/api/inventory')).send({
      name: 'Well Stocked Ingredient',
      totalQuantity: 100,
      unit: 'kg',
      costPerUnit: 1,
      lowStockThreshold: 5,
    });
    await asOwner(request(app).patch(`/api/inventory/${createRes.body._id}`)).send({
      preferredVendorId: vendorId,
      reorderQuantity: 20,
    });

    const res = await asOwner(request(app).get('/api/procurement/suggested-orders'));
    const found = res.body.some((s) => s.items.some((i) => i.inventoryItemId === createRes.body._id));
    expect(found).toBe(false);
  });
});
