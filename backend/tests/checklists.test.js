import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';

let app;
let teardown;
let ownerToken;
let ownerLocationId;
let asOwner;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  ({ token: ownerToken, locationId: ownerLocationId } = await createAuthedUser(app));
  asOwner = authedRequest(ownerToken, ownerLocationId);
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('checklists', () => {
  it('rejects a non-Owner/Manager from creating a checklist template', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .post('/api/checklists/templates')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ name: 'Opening Checklist', items: ['Check fridge temp'] });
    expect(res.status).toBe(403);
  });

  it('rejects a template with no items', async () => {
    const res = await asOwner(request(app).post('/api/checklists/templates')).send({
      name: 'Empty Checklist',
      items: [],
    });
    expect(res.status).toBe(400);
  });

  it('creates a checklist template and auto-generates a completion for today', async () => {
    const createRes = await asOwner(request(app).post('/api/checklists/templates')).send({
      name: 'Opening Checklist',
      items: ['Check fridge temp', 'Count cash drawer', 'Wipe down tables'],
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.items.length).toBe(3);

    const todayRes = await asOwner(request(app).get('/api/checklists/today'));
    expect(todayRes.status).toBe(200);
    expect(todayRes.body.length).toBe(1);
    expect(todayRes.body[0].templateName).toBe('Opening Checklist');
    expect(todayRes.body[0].totalCount).toBe(3);
    expect(todayRes.body[0].completedCount).toBe(0);
    expect(todayRes.body[0].items.every((i) => i.done === false)).toBe(true);
  });

  it('returns the same completion document on repeated calls for the same day (idempotent)', async () => {
    const first = await asOwner(request(app).get('/api/checklists/today'));
    const second = await asOwner(request(app).get('/api/checklists/today'));
    expect(first.body[0].completionId).toBe(second.body[0].completionId);
  });

  it('toggles a checklist item on and records who completed it and when, then toggles it back off', async () => {
    const todayRes = await asOwner(request(app).get('/api/checklists/today'));
    const completionId = todayRes.body[0].completionId;

    const onRes = await asOwner(request(app).patch(`/api/checklists/completions/${completionId}/items/0/toggle`));
    expect(onRes.status).toBe(200);
    expect(onRes.body.items[0].done).toBe(true);
    expect(onRes.body.items[0].completedBy).toBeTruthy();
    expect(onRes.body.items[0].completedAt).toBeTruthy();
    expect(onRes.body.completedCount).toBe(1);

    const offRes = await asOwner(request(app).patch(`/api/checklists/completions/${completionId}/items/0/toggle`));
    expect(offRes.body.items[0].done).toBe(false);
    expect(offRes.body.items[0].completedBy).toBe('');
    expect(offRes.body.completedCount).toBe(0);
  });

  it('lets any authenticated role (not just Owner/Manager) toggle a checklist item', async () => {
    // Must be a staff member of the SAME restaurant as ownerToken —
    // createAuthedUser spins up a brand-new tenant, which (correctly) can't
    // see this restaurant's checklist templates at all.
    await asOwner(request(app).post('/api/staff/invite')).send({
      name: 'Test Waiter',
      email: 'checklist-waiter@example.com',
      password: 'testpassword123',
      role: 'Waiter',
    });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'checklist-waiter@example.com', password: 'testpassword123' });
    const asWaiter = authedRequest(loginRes.body.token, ownerLocationId);

    const todayRes = await asWaiter(request(app).get('/api/checklists/today'));
    const completionId = todayRes.body[0].completionId;

    const res = await asWaiter(request(app).patch(`/api/checklists/completions/${completionId}/items/1/toggle`));
    expect(res.status).toBe(200);
    expect(res.body.items[1].done).toBe(true);
  });

  it('rejects toggling an out-of-range item index', async () => {
    const todayRes = await asOwner(request(app).get('/api/checklists/today'));
    const completionId = todayRes.body[0].completionId;
    const res = await asOwner(request(app).patch(`/api/checklists/completions/${completionId}/items/99/toggle`));
    expect(res.status).toBe(400);
  });

  it('deletes a template and its completions', async () => {
    const listRes = await asOwner(request(app).get('/api/checklists/templates'));
    const template = listRes.body.find((t) => t.name === 'Opening Checklist');

    const deleteRes = await asOwner(request(app).delete(`/api/checklists/templates/${template._id}`));
    expect(deleteRes.status).toBe(200);

    const todayRes = await asOwner(request(app).get('/api/checklists/today'));
    expect(todayRes.body.length).toBe(0);
  });
});
