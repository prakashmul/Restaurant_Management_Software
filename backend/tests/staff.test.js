import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';

let app;
let teardown;
let ownerToken;
let ownerUserId;
let ownerLocationId;
let roleIdByName;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  ({ token: ownerToken, userId: ownerUserId, locationId: ownerLocationId } = await createAuthedUser(app));

  const asOwnerReq = (req) => req.set('Authorization', `Bearer ${ownerToken}`);
  const rolesRes = await asOwnerReq(request(app).get('/api/roles'));
  roleIdByName = new Map(rolesRes.body.map((r) => [r.name, r._id]));
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
      roleId: roleIdByName.get('Waiter'),
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

    // Waiter doesn't have staff.view by default (matches the design mockup)
    // — viewing the staff list is an Owner/Manager thing.
    const staffRes = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(staffRes.status).toBe(403);
  });

  it('rejects a non-Owner from inviting staff', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .post('/api/staff/invite')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ name: 'X', email: 'nope@example.com', password: 'testpassword123', roleId: roleIdByName.get('Manager') });
    expect(res.status).toBe(403);
  });

  it('rejects inviting the same person to the same restaurant twice', async () => {
    const res = await asOwner(request(app).post('/api/staff/invite')).send({
      name: 'New Waiter',
      email: 'waiter-invite@example.com',
      password: 'testpassword123',
      roleId: roleIdByName.get('Cashier'),
    });
    expect(res.status).toBe(400);
  });

  it("lets the Owner change another staff member's role", async () => {
    const listRes = await asOwner(request(app).get('/api/staff'));
    const waiter = listRes.body.find((s) => s.email === 'waiter-invite@example.com');

    const res = await asOwner(request(app).patch(`/api/staff/${waiter.id}/role`)).send({
      roleId: roleIdByName.get('Manager'),
    });
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

describe('hourly rate & payroll export', () => {
  it('defaults a new staff member to a zero hourly rate', async () => {
    const res = await asOwner(request(app).get('/api/staff'));
    expect(res.body[0].hourlyRate).toBe(0);
  });

  it('lets the Owner set a staff member\'s hourly rate', async () => {
    const listRes = await asOwner(request(app).get('/api/staff'));
    const owner = listRes.body.find((s) => s.role === 'Owner');

    const res = await asOwner(request(app).patch(`/api/staff/${owner.id}/rate`)).send({ hourlyRate: 15.5 });
    expect(res.status).toBe(200);
    expect(res.body.hourlyRate).toBe(15.5);
  });

  it('rejects a negative hourly rate', async () => {
    const listRes = await asOwner(request(app).get('/api/staff'));
    const owner = listRes.body.find((s) => s.role === 'Owner');

    const res = await asOwner(request(app).patch(`/api/staff/${owner.id}/rate`)).send({ hourlyRate: -5 });
    expect(res.status).toBe(400);
  });

  it('rejects a non-Owner from setting an hourly rate', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const listRes = await asOwner(request(app).get('/api/staff'));
    const owner = listRes.body.find((s) => s.role === 'Owner');

    const res = await request(app)
      .patch(`/api/staff/${owner.id}/rate`)
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ hourlyRate: 20 });
    expect(res.status).toBe(403);
  });

  it('exports a payroll CSV with hours x rate computed from attendance records', async () => {
    const asOwnerAtLocation = authedRequest(ownerToken, ownerLocationId);
    const staffRes = await asOwnerAtLocation(request(app).get('/api/staff'));
    const owner = staffRes.body.find((s) => s.role === 'Owner');

    await asOwnerAtLocation(request(app).patch(`/api/staff/${owner.id}/rate`)).send({ hourlyRate: 20 });

    await asOwnerAtLocation(request(app).post('/api/attendance')).send({
      employeeName: owner.name,
      checkInTime: '9:00 AM',
      checkOutTime: '1:00 PM',
      duration: '04:00:00',
      status: 'Completed',
    });

    const today = new Date().toISOString().slice(0, 10);
    const res = await asOwnerAtLocation(
      request(app).get(`/api/staff/payroll/export?startDate=${today}&endDate=${today}`)
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);

    const rows = res.text.trim().split('\r\n');
    expect(rows[0]).toBe('Staff Member,Role,Hours Worked,Hourly Rate,Total Pay');
    const ownerRow = rows.find((r) => r.startsWith(`${owner.name},`));
    expect(ownerRow).toBe(`${owner.name},Owner,4.00,20.00,80.00`);
  });

  it('rejects a non-Owner from exporting payroll', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .get('/api/staff/payroll/export')
      .set('Authorization', `Bearer ${waiterToken}`);
    expect(res.status).toBe(403);
  });
});
