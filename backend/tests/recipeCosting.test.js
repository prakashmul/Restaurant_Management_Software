import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';
import MenuItem from '../models/MenuItem.js';

let app;
let teardown;
let restaurantId;
let auth;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const { token, locationId, restaurantId: rId } = await createAuthedUser(app);
  restaurantId = rId;
  auth = authedRequest(token, locationId);
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('recipe costing', () => {
  it('computes ingredient cost, food cost %, and units sold for a costed dish', async () => {
    const invRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Costing Ingredient',
      totalQuantity: 100,
      unit: 'units',
      costPerUnit: 10,
    });
    const inventoryItemId = invRes.body._id;

    const menuRes = await auth(request(app).post('/api/menu')).send({
      name: 'Costed Dish',
      category: 'Main Course',
      price: 100,
      recipe: [{ inventoryItemId, quantityPerPortion: 2 }], // costs 2*10 = 20
    });
    const menuItemId = menuRes.body._id;

    const tableRes = await auth(request(app).post('/api/tables')).send({ number: 901, seats: 2 });
    const saved = await auth(request(app).post('/api/orders/save')).send({
      tableId: tableRes.body._id,
      items: [{ menuItemId, name: 'Costed Dish', price: 100, quantity: 3 }],
    });
    await auth(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    const res = await auth(request(app).get('/api/recipe-costing'));
    expect(res.status).toBe(200);

    const dish = res.body.dishes.find((d) => d.id === menuItemId);
    expect(dish.ingredientCost).toBe(20);
    expect(dish.foodCostPercent).toBe(20); // 20/100 * 100
    expect(dish.margin).toBe(80);
    expect(dish.unitsSold).toBe(3);
  });

  it('reports null cost data for a dish whose recipe references an inventory item that no longer exists', async () => {
    // No deleteInventoryItem endpoint exists, so a "dangling reference" is
    // reproduced directly at the model layer rather than through the API.
    const danglingId = new mongoose.Types.ObjectId();
    const menuItem = await MenuItem.create({
      restaurantId,
      name: 'Uncostable Dish',
      category: 'Main Course',
      price: 50,
      recipe: [{ inventoryItemId: danglingId, quantityPerPortion: 1 }],
    });

    const res = await auth(request(app).get('/api/recipe-costing'));
    const dish = res.body.dishes.find((d) => d.id === menuItem._id.toString());
    expect(dish.ingredientCost).toBeNull();
    expect(dish.foodCostPercent).toBeNull();
    expect(dish.classification).toBeNull();
  });

  it('classifies dishes into menu-engineering quadrants once at least two dishes are costed', async () => {
    // 'Costed Dish' (price 100, cost 20, 3 units sold) already exists from an
    // earlier test in this file. Add a second costed dish with a thin margin
    // and no sales so there's a real popularity/margin split to classify.
    const invRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Second Costing Ingredient',
      totalQuantity: 100,
      unit: 'units',
      costPerUnit: 40,
    });
    await auth(request(app).post('/api/menu')).send({
      name: 'Thin Margin Dish',
      category: 'Main Course',
      price: 50,
      recipe: [{ inventoryItemId: invRes.body._id, quantityPerPortion: 1 }], // cost 40, margin 10
    });

    const res = await auth(request(app).get('/api/recipe-costing'));
    expect(res.status).toBe(200);
    const classified = res.body.dishes.filter((d) => d.classification !== null);
    expect(classified.length).toBeGreaterThanOrEqual(2);
    for (const dish of classified) {
      expect(['star', 'puzzle', 'plow-horse', 'dog']).toContain(dish.classification);
    }

    const costedDish = classified.find((d) => d.name === 'Costed Dish');
    const thinMarginDish = classified.find((d) => d.name === 'Thin Margin Dish');
    expect(costedDish.classification).toBe('star'); // higher popularity, higher margin
    expect(thinMarginDish.classification).toBe('dog'); // lower popularity, lower margin
  });

  it('surfaces manual stock deductions as the waste log, excluding auto-deductions from paid orders', async () => {
    const invRes = await auth(request(app).post('/api/inventory')).send({
      name: 'Waste Test Ingredient',
      totalQuantity: 20,
      unit: 'kg',
      costPerUnit: 3,
    });

    await auth(request(app).patch(`/api/inventory/${invRes.body._id}/restock`)).send({
      quantity: -2,
      performedBy: 'Test Chef',
      description: 'Spoiled — cold storage failure',
    });

    const res = await auth(request(app).get('/api/recipe-costing'));
    const wasteEntry = res.body.wasteLog.find((w) => w.itemName === 'Waste Test Ingredient');
    expect(wasteEntry).toBeTruthy();
    expect(wasteEntry.reason).toBe('Spoiled — cold storage failure');
    expect(wasteEntry.quantity).toBe(-2);

    const autoDeductionLeaked = res.body.wasteLog.some((w) => /^Auto-deducted for Order #/.test(w.reason));
    expect(autoDeductionLeaked).toBe(false);
  });

  it('rejects a non-Owner from the recipe costing report', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app).get('/api/recipe-costing').set('Authorization', `Bearer ${waiterToken}`);
    expect(res.status).toBe(403);
  });
});
