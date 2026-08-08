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

describe('low-stock alerts', () => {
  it('flags an ingredient as low stock once its quantity drops below the configured threshold', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Threshold Ingredient',
      totalQuantity: 20,
      unit: 'kg',
      costPerUnit: 2,
      lowStockThreshold: 10,
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.lowStockThreshold).toBe(10);
    expect(createRes.body.isLowStock).toBe(false); // 20 >= 10

    const restockRes = await auth(
      request(app).patch(`/api/inventory/${createRes.body._id}/restock`)
    ).send({ quantity: -15 }); // 20 - 15 = 5, below threshold
    expect(restockRes.body.totalQuantity).toBe(5);
    expect(restockRes.body.isLowStock).toBe(true);

    const listRes = await auth(request(app).get('/api/inventory'));
    const item = listRes.body.find((i) => i._id === createRes.body._id);
    expect(item.isLowStock).toBe(true);
  });

  it('does not flag an item with no threshold configured (0 = no alert)', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'No Threshold Ingredient',
      totalQuantity: 1,
      unit: 'kg',
      costPerUnit: 1,
    });
    expect(createRes.body.lowStockThreshold).toBe(0);
    expect(createRes.body.isLowStock).toBe(false);
  });

  it('lets an authorized role edit ingredient metadata including the threshold', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Editable Ingredient',
      totalQuantity: 10,
      unit: 'kg',
      costPerUnit: 1,
    });

    const updateRes = await auth(request(app).patch(`/api/inventory/${createRes.body._id}`)).send({
      name: 'Renamed Ingredient',
      costPerUnit: 5,
      lowStockThreshold: 8,
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Renamed Ingredient');
    expect(updateRes.body.costPerUnit).toBe(5);
    expect(updateRes.body.isLowStock).toBe(false); // 10 kg on hand >= threshold of 8

    // Restock down below the newly-edited threshold to confirm it actually took effect.
    const restockRes = await auth(
      request(app).patch(`/api/inventory/${createRes.body._id}/restock`)
    ).send({ quantity: -3 }); // 10 - 3 = 7, below the edited threshold of 8
    expect(restockRes.body.isLowStock).toBe(true);
  });

  it('sets and clears a barcode for scan-to-receive lookups', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Barcoded Ingredient',
      totalQuantity: 10,
      unit: 'kg',
      costPerUnit: 1,
    });

    const setRes = await auth(request(app).patch(`/api/inventory/${createRes.body._id}`)).send({
      barcode: '0123456789012',
    });
    expect(setRes.body.barcode).toBe('0123456789012');

    const listRes = await auth(request(app).get('/api/inventory'));
    const item = listRes.body.find((i) => i._id === createRes.body._id);
    expect(item.barcode).toBe('0123456789012');

    const clearRes = await auth(request(app).patch(`/api/inventory/${createRes.body._id}`)).send({
      barcode: null,
    });
    expect(clearRes.body.barcode).toBeNull();
  });

  it('rejects a role without stock.edit (Cashier) from editing ingredient metadata', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Protected Ingredient',
      totalQuantity: 5,
      unit: 'kg',
      costPerUnit: 1,
    });

    const { token: cashierToken, locationId } = await createAuthedUser(app, { role: 'Cashier' });
    const res = await request(app)
      .patch(`/api/inventory/${createRes.body._id}`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('X-Location-Id', locationId)
      .send({ costPerUnit: 999 });
    expect(res.status).toBe(403);
  });

  it('404s when editing an ingredient that does not exist', async () => {
    const res = await auth(request(app).patch('/api/inventory/000000000000000000000000')).send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('waste logging', () => {
  it('deducts stock and records the waste reason on the history entry', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Wasteable Ingredient',
      totalQuantity: 20,
      unit: 'kg',
      costPerUnit: 2,
    });

    const wasteRes = await auth(
      request(app).patch(`/api/inventory/${createRes.body._id}/waste`)
    ).send({ quantity: 3, wasteReason: 'spoilage', performedBy: 'Chef', description: 'Left out overnight' });
    expect(wasteRes.status).toBe(200);
    expect(wasteRes.body.totalQuantity).toBe(17); // 20 - 3

    const historyRes = await auth(request(app).get('/api/inventory/history'));
    const entry = historyRes.body.find((h) => h.itemId === createRes.body._id);
    expect(entry.quantity).toBe(-3);
    expect(entry.wasteReason).toBe('spoilage');
    expect(entry.performedBy).toBe('Chef');
  });

  it('rejects a non-positive waste quantity', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Another Wasteable Ingredient',
      totalQuantity: 10,
      unit: 'kg',
      costPerUnit: 1,
    });

    const res = await auth(request(app).patch(`/api/inventory/${createRes.body._id}/waste`)).send({
      quantity: 0,
      wasteReason: 'breakage',
    });
    expect(res.status).toBe(400);
  });

  it('rejects an unrecognized waste reason', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Third Wasteable Ingredient',
      totalQuantity: 10,
      unit: 'kg',
      costPerUnit: 1,
    });

    const res = await auth(request(app).patch(`/api/inventory/${createRes.body._id}/waste`)).send({
      quantity: 1,
      wasteReason: 'not-a-real-reason',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a role without stock.edit (Cashier) from logging waste', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Fourth Wasteable Ingredient',
      totalQuantity: 10,
      unit: 'kg',
      costPerUnit: 1,
    });

    const { token: cashierToken, locationId } = await createAuthedUser(app, { role: 'Cashier' });
    const res = await request(app)
      .patch(`/api/inventory/${createRes.body._id}/waste`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .set('X-Location-Id', locationId)
      .send({ quantity: 1, wasteReason: 'other' });
    expect(res.status).toBe(403);
  });
});
