import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';
import { sendDailySummaries } from '../services/summaryReportService.js';
import { testSentEmails } from '../services/notificationService.js';

let app;
let teardown;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
}, 60000);

afterAll(async () => {
  await teardown();
});

beforeEach(() => {
  testSentEmails.length = 0;
});

describe('daily summary reports', () => {
  it('emails Owner a summary once at least one order was paid today', async () => {
    const { token, locationId } = await createAuthedUser(app, { restaurantName: 'Summary Diner' });
    const asOwner = authedRequest(token, locationId);

    // Every new restaurant auto-seeds a Table #1 — reuse it rather than
    // creating a second one and colliding on the (restaurant, location,
    // number) unique index.
    const tablesRes = await asOwner(request(app).get('/api/tables'));
    const tableId = tablesRes.body[0]._id;
    const menuRes = await asOwner(request(app).post('/api/menu')).send({
      name: 'Summary Dish',
      category: 'Main Course',
      price: 250,
      recipe: [],
    });
    const saved = await asOwner(request(app).post('/api/orders/save')).send({
      tableId,
      items: [{ menuItemId: menuRes.body._id, name: 'Summary Dish', price: 250, quantity: 2 }],
    });
    await asOwner(request(app).post(`/api/orders/${saved.body._id}/pay`)).send({ paymentMethod: 'cash' });

    await sendDailySummaries();

    const sent = testSentEmails.filter((e) => e.restaurantName === 'Summary Diner');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0].html).toContain('Orders: 1');
    // 250 * 2 = 500 subtotal, +8% default tax = 540
    expect(sent[0].html).toContain('540.00');
  });

  it('sends nothing for a location with no orders today', async () => {
    await createAuthedUser(app, { restaurantName: 'Quiet Diner' });
    await sendDailySummaries();
    // Only assert against this restaurant — other restaurants created by
    // earlier tests in this file may still be within "today" and legitimately
    // generate their own summary emails.
    const quietDinerEmails = testSentEmails.filter((e) => e.restaurantName === 'Quiet Diner');
    expect(quietDinerEmails.length).toBe(0);
  });
});
