import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser } from './helpers/auth.js';

let app;
let teardown;
let ownerToken;
let ownerUserId;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  ({ token: ownerToken, userId: ownerUserId } = await createAuthedUser(app));
}, 60000);

afterAll(async () => {
  await teardown();
});

const asOwner = (req) => req.set('Authorization', `Bearer ${ownerToken}`);

describe('staff management', () => {
  it('lists the Owner as the sole staff member right after registration', async () => {
    const res = await asOwner(request(app).get('/api/staff'));
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].role).toBe('Owner');
    expect(res.body[0].userId).toBe(ownerUserId);
  });

  it('lets the Owner invite a new staff member', async () => {
    const res = await asOwner(request(app).post('/api/staff/invite')).send({
      name: 'New Waiter',
      email: 'waiter-invite@example.com',
      password: 'testpassword123',
      role: 'Waiter',
    });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('Waiter');
    expect(res.body.email).toBe('waiter-invite@example.com');
  });

  it('lets an invited staff member log in and receive a token scoped to that role and restaurant', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'waiter-invite@example.com', password: 'testpassword123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe('Waiter');

    const staffRes = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(staffRes.status).toBe(200);
    expect(staffRes.body.length).toBe(2);
  });

  it('rejects a non-Owner from inviting staff', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .post('/api/staff/invite')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ name: 'X', email: 'nope@example.com', password: 'testpassword123', role: 'Manager' });
    expect(res.status).toBe(403);
  });

  it('rejects inviting the same person to the same restaurant twice', async () => {
    const res = await asOwner(request(app).post('/api/staff/invite')).send({
      name: 'New Waiter',
      email: 'waiter-invite@example.com',
      password: 'testpassword123',
      role: 'Cashier',
    });
    expect(res.status).toBe(400);
  });

  it("lets the Owner change another staff member's role", async () => {
    const listRes = await asOwner(request(app).get('/api/staff'));
    const waiter = listRes.body.find((s) => s.email === 'waiter-invite@example.com');

    const res = await asOwner(request(app).patch(`/api/staff/${waiter.id}/role`)).send({ role: 'Manager' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Manager');
  });

  it('prevents the Owner from changing their own role', async () => {
    const listRes = await asOwner(request(app).get('/api/staff'));
    const owner = listRes.body.find((s) => s.role === 'Owner');

    const res = await asOwner(request(app).patch(`/api/staff/${owner.id}/role`)).send({ role: 'Manager' });
    expect(res.status).toBe(400);
  });

  it('prevents removing the last Owner of a restaurant', async () => {
    const listRes = await asOwner(request(app).get('/api/staff'));
    const owner = listRes.body.find((s) => s.role === 'Owner');

    const res = await asOwner(request(app).delete(`/api/staff/${owner.id}`));
    expect(res.status).toBe(400);
  });

  it('lets the Owner remove a non-Owner staff member', async () => {
    const listRes = await asOwner(request(app).get('/api/staff'));
    const manager = listRes.body.find((s) => s.email === 'waiter-invite@example.com');

    const res = await asOwner(request(app).delete(`/api/staff/${manager.id}`));
    expect(res.status).toBe(200);

    const afterList = await asOwner(request(app).get('/api/staff'));
    expect(afterList.body.some((s) => s.email === 'waiter-invite@example.com')).toBe(false);
  });
});
