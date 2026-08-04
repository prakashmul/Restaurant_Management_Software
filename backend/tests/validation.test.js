import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser } from './helpers/auth.js';

let app;
let teardown;
let token;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  ({ token } = await createAuthedUser(app));
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('input validation', () => {
  it('rejects a category with an empty name', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid category', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Validation Test Category' });
    expect(res.status).toBe(201);
  });

  it('rejects a menu item with a negative price', async () => {
    const res = await request(app)
      .post('/api/menu')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad Item', category: 'Main Course', price: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects a menu item missing required fields', async () => {
    const res = await request(app)
      .post('/api/menu')
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 5 });
    expect(res.status).toBe(400);
  });

  it('coerces numeric strings on inventory creation', async () => {
    const res = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Ingredient', totalQuantity: '10', unit: 'kg', costPerUnit: '2.5' });
    expect(res.status).toBe(201);
    expect(res.body.totalQuantity).toBe(10);
    expect(res.body.costPerUnit).toBe(2.5);
  });

  it('rejects a non-numeric table number', async () => {
    const res = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${token}`)
      .send({ number: 'not-a-number' });
    expect(res.status).toBe(400);
  });

  it('returns a 400 with field-level details, not a 500, for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{not valid json');
    expect(res.status).toBe(400);
  });
});
