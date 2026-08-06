import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';

let app;
let teardown;
let ownerToken;
let mainLocationId;
let secondLocationId;
let inventoryItemId;
let asOwner;
let asSecondLocation;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const { token, locationId } = await createAuthedUser(app);
  ownerToken = token;
  mainLocationId = locationId;
  asOwner = authedRequest(token, locationId);

  const locRes = await asOwner(request(app).post('/api/locations')).send({ name: 'Branch B' });
  secondLocationId = locRes.body._id;
  asSecondLocation = authedRequest(ownerToken, secondLocationId);

  const invRes = await asOwner(request(app).post('/api/inventory')).send({
    name: 'Transfer Test Ingredient',
    totalQuantity: 20,
    unit: 'kg',
    costPerUnit: 4,
  });
  inventoryItemId = invRes.body._id;
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('transfers', () => {
  it('rejects a non-Owner/Manager from creating a transfer', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ toLocationId: secondLocationId, items: [{ inventoryItemId, quantity: 1 }] });
    expect(res.status).toBe(403);
  });

  it('rejects a transfer to the same location', async () => {
    const res = await asOwner(request(app).post('/api/transfers')).send({
      toLocationId: mainLocationId,
      items: [{ inventoryItemId, quantity: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a transfer to a location that does not exist', async () => {
    const res = await asOwner(request(app).post('/api/transfers')).send({
      toLocationId: '000000000000000000000000',
      items: [{ inventoryItemId, quantity: 1 }],
    });
    expect(res.status).toBe(404);
  });

  it('rejects a transfer when the source location does not have enough stock', async () => {
    const res = await asOwner(request(app).post('/api/transfers')).send({
      toLocationId: secondLocationId,
      items: [{ inventoryItemId, quantity: 9999 }],
    });
    expect(res.status).toBe(409);
  });

  let transferId;

  it('creates a transfer, immediately debiting the source location', async () => {
    const res = await asOwner(request(app).post('/api/transfers')).send({
      toLocationId: secondLocationId,
      items: [{ inventoryItemId, quantity: 5 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('in_transit');
    expect(res.body.fromLocationName).toBe('Main Location');
    expect(res.body.toLocationName).toBe('Branch B');
    transferId = res.body._id;

    const mainInv = await asOwner(request(app).get('/api/inventory'));
    expect(mainInv.body.find((i) => i._id === inventoryItemId).totalQuantity).toBe(15);

    const branchInv = await asSecondLocation(request(app).get('/api/inventory'));
    expect(branchInv.body.find((i) => i._id === inventoryItemId).totalQuantity).toBe(0);

    const history = await asOwner(request(app).get('/api/inventory/history'));
    const entry = history.body.find((h) => h.description.includes('Transferred to Branch B'));
    expect(entry).toBeTruthy();
    expect(entry.quantity).toBe(-5);
  });

  it('shows the transfer to both the source and destination location', async () => {
    const fromSource = await asOwner(request(app).get('/api/transfers'));
    expect(fromSource.body.some((t) => t._id === transferId)).toBe(true);

    const fromDestination = await asSecondLocation(request(app).get('/api/transfers'));
    expect(fromDestination.body.some((t) => t._id === transferId)).toBe(true);
  });

  it('refuses to let the source location receive its own outgoing transfer', async () => {
    const res = await asOwner(request(app).patch(`/api/transfers/${transferId}/receive`));
    expect(res.status).toBe(404);
  });

  it('lets the destination location receive the transfer, crediting its stock', async () => {
    const res = await asSecondLocation(request(app).patch(`/api/transfers/${transferId}/receive`));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('received');
    expect(res.body.receivedAt).toBeTruthy();

    const branchInv = await asSecondLocation(request(app).get('/api/inventory'));
    expect(branchInv.body.find((i) => i._id === inventoryItemId).totalQuantity).toBe(5);

    const history = await asSecondLocation(request(app).get('/api/inventory/history'));
    const entry = history.body.find((h) => h.description.includes('Received transfer from Main Location'));
    expect(entry).toBeTruthy();
    expect(entry.quantity).toBe(5);
  });

  it('rejects receiving the same transfer twice', async () => {
    const res = await asSecondLocation(request(app).patch(`/api/transfers/${transferId}/receive`));
    expect(res.status).toBe(404);
  });

  it('lets the source location cancel a still-in-transit transfer, refunding its stock', async () => {
    const createRes = await asOwner(request(app).post('/api/transfers')).send({
      toLocationId: secondLocationId,
      items: [{ inventoryItemId, quantity: 3 }],
    });
    expect(createRes.status).toBe(201);

    const mainInvAfterSend = await asOwner(request(app).get('/api/inventory'));
    expect(mainInvAfterSend.body.find((i) => i._id === inventoryItemId).totalQuantity).toBe(12); // 15 - 3

    const cancelRes = await asOwner(request(app).patch(`/api/transfers/${createRes.body._id}/cancel`));
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('cancelled');

    const mainInvAfterCancel = await asOwner(request(app).get('/api/inventory'));
    expect(mainInvAfterCancel.body.find((i) => i._id === inventoryItemId).totalQuantity).toBe(15);
  });

  it('refuses to let the destination location cancel a transfer it did not send', async () => {
    const createRes = await asOwner(request(app).post('/api/transfers')).send({
      toLocationId: secondLocationId,
      items: [{ inventoryItemId, quantity: 1 }],
    });
    const res = await asSecondLocation(request(app).patch(`/api/transfers/${createRes.body._id}/cancel`));
    expect(res.status).toBe(404);
  });
});
