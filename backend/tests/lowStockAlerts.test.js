import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';
import { checkLowStockAndAlert } from '../services/lowStockAlertService.js';
import Location from '../models/Location.js';

let app;
let teardown;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('low-stock alerts', () => {
  it('marks a location alerted when an item is below its threshold, then respects the cooldown on an immediate re-check', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);

    await asOwner(request(app).post('/api/inventory')).send({
      name: 'Low Rum',
      totalQuantity: 2,
      unit: 'bottles',
      costPerUnit: 500,
      lowStockThreshold: 10,
      performedBy: 'Test Setup',
      description: 'Initial stock',
    });

    await checkLowStockAndAlert();
    const afterFirst = await Location.findById(locationId);
    expect(afterFirst.lastLowStockAlertAt).toBeTruthy();
    const firstAlertTime = afterFirst.lastLowStockAlertAt.getTime();

    await checkLowStockAndAlert();
    const afterSecond = await Location.findById(locationId);
    expect(afterSecond.lastLowStockAlertAt.getTime()).toBe(firstAlertTime);
  });

  it('never alerts a location where nothing is below threshold', async () => {
    const { token, locationId } = await createAuthedUser(app);
    const asOwner = authedRequest(token, locationId);

    await asOwner(request(app).post('/api/inventory')).send({
      name: 'Plenty Vodka',
      totalQuantity: 50,
      unit: 'bottles',
      costPerUnit: 400,
      lowStockThreshold: 10,
      performedBy: 'Test Setup',
      description: 'Initial stock',
    });

    await checkLowStockAndAlert();
    const location = await Location.findById(locationId);
    expect(location.lastLowStockAlertAt).toBeNull();
  });
});
