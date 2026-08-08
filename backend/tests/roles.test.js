import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest, inviteAndLoginStaff } from './helpers/auth.js';

let app;
let teardown;
let ownerToken;
let ownerLocationId;
let asOwner;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const { token, locationId } = await createAuthedUser(app);
  ownerToken = token;
  ownerLocationId = locationId;
  asOwner = authedRequest(token, locationId);
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('roles', () => {
  it('seeds the 5 default roles at registration, with the Owner counted as a user', async () => {
    const res = await asOwner(request(app).get('/api/roles'));
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(5);

    const names = res.body.map((r) => r.name).sort();
    expect(names).toEqual(['Cashier', 'Kitchen', 'Manager', 'Owner', 'Waiter']);

    const owner = res.body.find((r) => r.name === 'Owner');
    expect(owner.isOwnerRole).toBe(true);
    expect(owner.userCount).toBe(1);
    expect(owner.permissions).toContain('settings.roles');

    const waiter = res.body.find((r) => r.name === 'Waiter');
    expect(waiter.permissions).not.toContain('settings.roles');
    expect(waiter.permissions).toContain('tables');
  });

  it('rejects a role without settings.roles (Waiter) from creating a custom role', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .post('/api/roles')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ name: 'Shift Lead', permissions: ['tables'] });
    expect(res.status).toBe(403);
  });

  it('rejects creating a role named "Owner"', async () => {
    const res = await asOwner(request(app).post('/api/roles')).send({ name: 'Owner', permissions: [] });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown permission key', async () => {
    const res = await asOwner(request(app).post('/api/roles')).send({
      name: 'Bad Role',
      permissions: ['not.a.real.permission'],
    });
    expect(res.status).toBe(400);
  });

  let shiftLeadId;

  it('creates a custom role', async () => {
    const res = await asOwner(request(app).post('/api/roles')).send({
      name: 'Shift Lead',
      description: 'Waiter with void + settle powers during a shift.',
      permissions: ['tables', 'customers', 'orders.view', 'orders.edit', 'orders.checkout', 'orders.void', 'menu.view', 'stock.view', 'credit.view', 'credit.settle'],
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Shift Lead');
    expect(res.body.isOwnerRole).toBe(false);
    expect(res.body.userCount).toBe(0);
    shiftLeadId = res.body._id;

    const listRes = await asOwner(request(app).get('/api/roles'));
    expect(listRes.body.length).toBe(6);
  });

  it('rejects the Owner role from being edited or deleted', async () => {
    const listRes = await asOwner(request(app).get('/api/roles'));
    const ownerRole = listRes.body.find((r) => r.name === 'Owner');

    const editRes = await asOwner(request(app).patch(`/api/roles/${ownerRole._id}`)).send({ permissions: [] });
    expect(editRes.status).toBe(400);

    const deleteRes = await asOwner(request(app).delete(`/api/roles/${ownerRole._id}`));
    expect(deleteRes.status).toBe(400);
  });

  let shiftLeadUserToken;

  it('assigns a staff member to the custom role and enforces exactly its permission set', async () => {
    const { token } = await inviteAndLoginStaff(app, asOwner, {
      name: 'Shift Lead Person',
      email: 'shiftlead@example.com',
      roleId: shiftLeadId,
    });
    shiftLeadUserToken = token;
    const asShiftLead = authedRequest(shiftLeadUserToken, ownerLocationId);

    // Has tables (granted).
    const tablesRes = await asShiftLead(request(app).get('/api/tables'));
    expect(tablesRes.status).toBe(200);

    // Does not have stock.edit (not granted) or settings.staff.
    const restockRes = await asShiftLead(request(app).post('/api/inventory')).send({
      name: 'Should Fail',
      totalQuantity: 1,
      unit: 'units',
      costPerUnit: 1,
    });
    expect(restockRes.status).toBe(403);

    const staffListRes = await asShiftLead(request(app).get('/api/staff'));
    expect(staffListRes.status).toBe(403);

    const roleCountRes = await asOwner(request(app).get('/api/roles'));
    expect(roleCountRes.body.find((r) => r._id === shiftLeadId).userCount).toBe(1);
  });

  it('re-checks permissions fresh on every request — editing a role changes access without a new login', async () => {
    const asShiftLead = authedRequest(shiftLeadUserToken, ownerLocationId);

    // Grant stock.edit to the already-logged-in Shift Lead's role.
    const updateRes = await asOwner(request(app).patch(`/api/roles/${shiftLeadId}`)).send({
      permissions: ['tables', 'customers', 'orders.view', 'orders.edit', 'orders.checkout', 'orders.void', 'menu.view', 'stock.view', 'stock.edit', 'credit.view', 'credit.settle'],
    });
    expect(updateRes.status).toBe(200);

    // Same JWT as before, issued before this change — must now succeed.
    const restockRes = await asShiftLead(request(app).post('/api/inventory')).send({
      name: 'Should Now Work',
      totalQuantity: 1,
      unit: 'units',
      costPerUnit: 1,
    });
    expect(restockRes.status).toBe(201);
  });

  it('a custom role can be granted access to a feature that used to be hardcoded to Owner/Manager', async () => {
    const asShiftLead = authedRequest(shiftLeadUserToken, ownerLocationId);

    // Shift Lead has never been granted procurement.view.
    const deniedRes = await asShiftLead(request(app).get('/api/procurement/vendors'));
    expect(deniedRes.status).toBe(403);

    await asOwner(request(app).patch(`/api/roles/${shiftLeadId}`)).send({
      permissions: [
        'tables', 'customers', 'orders.view', 'orders.edit', 'orders.checkout', 'orders.void',
        'menu.view', 'stock.view', 'stock.edit', 'credit.view', 'credit.settle', 'procurement.view',
      ],
    });

    const grantedRes = await asShiftLead(request(app).get('/api/procurement/vendors'));
    expect(grantedRes.status).toBe(200);

    // procurement.manage still isn't granted, so mutating remains blocked.
    const manageRes = await asShiftLead(request(app).post('/api/procurement/vendors')).send({
      name: 'Should Fail',
      category: 'Test',
    });
    expect(manageRes.status).toBe(403);
  });

  it('refuses to delete a role that still has staff assigned', async () => {
    const res = await asOwner(request(app).delete(`/api/roles/${shiftLeadId}`));
    expect(res.status).toBe(400);
  });

  it('renaming a role updates the denormalized role name on its members', async () => {
    const renameRes = await asOwner(request(app).patch(`/api/roles/${shiftLeadId}`)).send({ name: 'Senior Shift Lead' });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.name).toBe('Senior Shift Lead');

    const staffRes = await asOwner(request(app).get('/api/staff'));
    const member = staffRes.body.find((s) => s.email === 'shiftlead@example.com');
    expect(member.role).toBe('Senior Shift Lead');
  });

  it('deletes a role once no staff reference it', async () => {
    const staffRes = await asOwner(request(app).get('/api/staff'));
    const member = staffRes.body.find((s) => s.email === 'shiftlead@example.com');

    const rolesRes = await asOwner(request(app).get('/api/roles'));
    const managerRoleId = rolesRes.body.find((r) => r.name === 'Manager')._id;

    await asOwner(request(app).patch(`/api/staff/${member.id}/role`)).send({ roleId: managerRoleId });

    const deleteRes = await asOwner(request(app).delete(`/api/roles/${shiftLeadId}`));
    expect(deleteRes.status).toBe(200);

    const listRes = await asOwner(request(app).get('/api/roles'));
    expect(listRes.body.some((r) => r._id === shiftLeadId)).toBe(false);
  });
});
