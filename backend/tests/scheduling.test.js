import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';

let app;
let teardown;
let ownerToken;
let ownerStaffId;
let asOwner;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
  const { token, locationId } = await createAuthedUser(app);
  ownerToken = token;
  asOwner = authedRequest(token, locationId);

  const staffRes = await asOwner(request(app).get('/api/staff'));
  ownerStaffId = staffRes.body[0].id;
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('scheduling', () => {
  it('rejects a non-Owner/Manager from creating a shift', async () => {
    const { token: waiterToken } = await createAuthedUser(app, { role: 'Waiter' });
    const res = await request(app)
      .post('/api/scheduling/shifts')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ staffMembershipId: ownerStaffId, date: '2026-02-02', startTime: '10:00', endTime: '18:00' });
    expect(res.status).toBe(403);
  });

  it('rejects a shift where end time is not after start time', async () => {
    const res = await asOwner(request(app).post('/api/scheduling/shifts')).send({
      staffMembershipId: ownerStaffId,
      date: '2026-02-02',
      startTime: '18:00',
      endTime: '10:00',
    });
    expect(res.status).toBe(400);
  });

  it('creates a shift with a staffName/role snapshot from the StaffMembership', async () => {
    const res = await asOwner(request(app).post('/api/scheduling/shifts')).send({
      staffMembershipId: ownerStaffId,
      date: '2026-02-02',
      startTime: '10:00',
      endTime: '18:00',
    });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('Owner');
    expect(res.body.staffName).toBeTruthy();
  });

  it('lists shifts within a date range', async () => {
    await asOwner(request(app).post('/api/scheduling/shifts')).send({
      staffMembershipId: ownerStaffId,
      date: '2026-02-09', // outside the range below
      startTime: '10:00',
      endTime: '18:00',
    });

    const res = await asOwner(request(app).get('/api/scheduling/shifts?start=2026-02-01&end=2026-02-05'));
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].date).toBe('2026-02-02');
  });

  it('computes planned vs. actual hours for the week, matched by employee name', async () => {
    const staffRes = await asOwner(request(app).get('/api/staff'));
    const staffName = staffRes.body[0].name;

    // Simulate 6 actual clocked hours logged today (falls inside the range below).
    await asOwner(request(app).post('/api/attendance')).send({
      employeeName: staffName,
      checkInTime: '9:00 AM',
      checkOutTime: '3:00 PM',
      duration: '06:00:00',
      status: 'Completed',
    });

    const today = new Date().toISOString().slice(0, 10);
    await asOwner(request(app).post('/api/scheduling/shifts')).send({
      staffMembershipId: ownerStaffId,
      date: today,
      startTime: '09:00',
      endTime: '17:00', // planned 8 hours
    });

    const res = await asOwner(request(app).get(`/api/scheduling/variance?start=${today}&end=${today}`));
    expect(res.status).toBe(200);
    const staffVariance = res.body.perStaff.find((p) => p.name === staffName);
    expect(staffVariance.plannedSeconds).toBe(8 * 3600);
    expect(staffVariance.actualSeconds).toBe(6 * 3600);
    expect(res.body.totalPlannedSeconds).toBeGreaterThanOrEqual(8 * 3600);
  });

  it('deletes a shift', async () => {
    const listRes = await asOwner(request(app).get('/api/scheduling/shifts?start=2026-02-01&end=2026-02-05'));
    const shiftId = listRes.body[0]._id;

    const deleteRes = await asOwner(request(app).delete(`/api/scheduling/shifts/${shiftId}`));
    expect(deleteRes.status).toBe(200);

    const afterRes = await asOwner(request(app).get('/api/scheduling/shifts?start=2026-02-01&end=2026-02-05'));
    expect(afterRes.body.length).toBe(0);
  });

  it('rejects scheduling a staff member who does not belong to this restaurant', async () => {
    const { token: otherOwnerToken } = await createAuthedUser(app);
    const otherStaffRes = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${otherOwnerToken}`);
    const otherStaffId = otherStaffRes.body[0].id;

    const res = await asOwner(request(app).post('/api/scheduling/shifts')).send({
      staffMembershipId: otherStaffId,
      date: '2026-02-02',
      startTime: '10:00',
      endTime: '18:00',
    });
    expect(res.status).toBe(404);
  });
});
