import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';
import Stock from '../models/Stock.js';
import { migrateStockCostPerUnit } from '../services/stockCostMigrationService.js';

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

describe('weighted-average costing', () => {
  it("matches the worked example: 1.2kg left @ Rs.100 blended with 4kg received @ Rs.110 averages to Rs.107.69", async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Flour',
      totalQuantity: 5,
      unit: 'kg',
      costPerUnit: 100,
    });
    expect(createRes.body.costPerUnit).toBe(100);
    const itemId = createRes.body._id;

    // Used down to 1.2kg left — a plain quantity-only adjustment, no price.
    const usedRes = await auth(request(app).patch(`/api/inventory/${itemId}/restock`)).send({
      quantity: -3.8,
      description: 'Used in prep',
    });
    expect(usedRes.body.totalQuantity).toBeCloseTo(1.2);
    expect(usedRes.body.costPerUnit).toBe(100); // unchanged — no price on that adjustment

    // Buy 4kg more at a different price.
    const restockRes = await auth(request(app).patch(`/api/inventory/${itemId}/restock`)).send({
      quantity: 4,
      unitCost: 110,
      description: 'Restocked from market',
    });
    expect(restockRes.status).toBe(200);
    expect(restockRes.body.totalQuantity).toBeCloseTo(5.2);
    // (1.2 * 100 + 4 * 110) / 5.2 = 107.6923...
    expect(restockRes.body.costPerUnit).toBeCloseTo(107.6923, 3);

    const listRes = await auth(request(app).get('/api/inventory'));
    const item = listRes.body.find((i) => i._id === itemId);
    expect(item.costPerUnit).toBeCloseTo(107.6923, 3);
  });

  it('a restock with no unitCost never changes the average cost', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Rice',
      totalQuantity: 10,
      unit: 'kg',
      costPerUnit: 50,
    });
    const itemId = createRes.body._id;

    const res = await auth(request(app).patch(`/api/inventory/${itemId}/restock`)).send({
      quantity: 5,
      description: 'Quick top-up, price unknown',
    });
    expect(res.body.totalQuantity).toBe(15);
    expect(res.body.costPerUnit).toBe(50);
  });

  it('a manual cost edit overrides this location\'s cost outright, and the next priced restock blends from there', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Sugar',
      totalQuantity: 10,
      unit: 'kg',
      costPerUnit: 40,
    });
    const itemId = createRes.body._id;

    const editRes = await auth(request(app).patch(`/api/inventory/${itemId}`)).send({ costPerUnit: 60 });
    expect(editRes.body.costPerUnit).toBe(60); // direct override, not a blend with the original 40

    const restockRes = await auth(request(app).patch(`/api/inventory/${itemId}/restock`)).send({
      quantity: 10,
      unitCost: 80,
      description: 'Another purchase',
    });
    // (10 * 60 + 10 * 80) / 20 = 70 — blends from the manually-corrected 60, not the stale 40.
    expect(restockRes.body.costPerUnit).toBeCloseTo(70, 3);
  });

  it('receiving a purchase order recomputes the weighted-average cost from what was actually paid', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Cooking Oil',
      totalQuantity: 2,
      unit: 'liters',
      costPerUnit: 200,
    });
    const itemId = createRes.body._id;

    const vendorRes = await auth(request(app).post('/api/procurement/vendors')).send({
      name: 'Oil Supplier',
      category: 'Pantry',
    });

    const poRes = await auth(request(app).post('/api/procurement/purchase-orders')).send({
      vendorId: vendorRes.body._id,
      items: [{ inventoryItemId: itemId, quantity: 3, unitCost: 240 }],
    });
    await auth(request(app).patch(`/api/procurement/purchase-orders/${poRes.body._id}/status`)).send({ status: 'sent' });
    const receivedRes = await auth(
      request(app).patch(`/api/procurement/purchase-orders/${poRes.body._id}/status`)
    ).send({ status: 'received' });
    expect(receivedRes.status).toBe(200);

    const listRes = await auth(request(app).get('/api/inventory'));
    const item = listRes.body.find((i) => i._id === itemId);
    expect(item.totalQuantity).toBe(5);
    // (2 * 200 + 3 * 240) / 5 = 224
    expect(item.costPerUnit).toBeCloseTo(224, 3);
  });

  it('tracks cost independently per location, and blends them for the cross-location view', async () => {
    const { token: ownerToken, locationId: locationA } = await createAuthedUser(app);
    const asLocationA = authedRequest(ownerToken, locationA);
    const asAllLocations = authedRequest(ownerToken, null);

    const locRes = await asLocationA(request(app).post('/api/locations')).send({ name: 'Branch B' });
    const locationB = locRes.body._id;
    const asLocationB = authedRequest(ownerToken, locationB);

    const createRes = await asLocationA(request(app).post('/api/inventory')).send({
      name: 'Shared Ingredient',
      totalQuantity: 10,
      unit: 'kg',
      costPerUnit: 100,
    });
    const itemId = createRes.body._id;

    // Location B starts with nothing — give it its own stock at a different price.
    await asLocationB(request(app).patch(`/api/inventory/${itemId}/restock`)).send({
      quantity: 10,
      unitCost: 300,
      description: 'Branch B stocked separately',
    });

    const aView = await asLocationA(request(app).get('/api/inventory'));
    const bView = await asLocationB(request(app).get('/api/inventory'));
    const allView = await asAllLocations(request(app).get('/api/inventory'));

    expect(aView.body.find((i) => i._id === itemId).costPerUnit).toBe(100);
    expect(bView.body.find((i) => i._id === itemId).costPerUnit).toBe(300);
    // (10*100 + 10*300) / 20 = 200 — quantity-weighted blend across both branches.
    expect(allView.body.find((i) => i._id === itemId).costPerUnit).toBeCloseTo(200, 3);
  });

  it('migrateStockCostPerUnit backfills a Stock document missing costPerUnit from its ingredient\'s cost, idempotently', async () => {
    const createRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Pre-Migration Ingredient',
      totalQuantity: 5,
      unit: 'kg',
      costPerUnit: 42,
    });
    const itemId = createRes.body._id;

    // Simulate a Stock doc from before this field existed. Bypass Mongoose
    // for the read-back — the schema default would otherwise mask the
    // field's real absence with a hydrated `null`.
    await Stock.updateOne({ inventoryItemId: itemId }, { $unset: { costPerUnit: '' } });
    const before = await Stock.collection.findOne({ inventoryItemId: new mongoose.Types.ObjectId(itemId) });
    expect('costPerUnit' in before).toBe(false);

    await migrateStockCostPerUnit();
    const after = await Stock.findOne({ inventoryItemId: itemId });
    expect(after.costPerUnit).toBe(42);

    // Re-running must not disturb an already-priced restock that happened since.
    await auth(request(app).patch(`/api/inventory/${itemId}/restock`)).send({ quantity: 5, unitCost: 50 });
    await migrateStockCostPerUnit();
    const rerun = await Stock.findOne({ inventoryItemId: itemId });
    expect(rerun.costPerUnit).toBeCloseTo(46, 3); // (5*42 + 5*50)/10, untouched by the re-run
  });
});
