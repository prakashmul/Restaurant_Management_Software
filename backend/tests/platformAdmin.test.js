import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser, authedRequest } from './helpers/auth.js';
import { hashResetToken } from '../utils/resetToken.js';
import PlatformAdmin from '../models/PlatformAdmin.js';
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import StaffMembership from '../models/StaffMembership.js';
import Location from '../models/Location.js';
import Expense from '../models/Expense.js';
import Role from '../models/Role.js';
import {
  migrateGrandfatherEnabledPages,
  migrateGrandfatherDashboardChecklists,
} from '../services/enabledPagesMigrationService.js';
import { migrateUniversalPagesToExistingRoles } from '../services/roleMigrationService.js';
import { PAGE_PERMISSION_KEYS } from '../permissions.js';

let app;
let teardown;
let adminEmail;
let adminPassword;
let adminToken;
let tenant;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());

  adminEmail = 'mulprakash23@gmail.com';
  adminPassword = 'Aquasight@23';
  await PlatformAdmin.create({ name: 'Platform Owner', email: adminEmail, password: adminPassword, isSeedAccount: true });

  tenant = await createAuthedUser(app);
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('platform admin login', () => {
  it('logs in the seeded platform admin via the shared /api/auth/login route', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: adminEmail, password: adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.platformAdmin).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.admin.email).toBe(adminEmail);
    expect(res.body.user).toBeUndefined();
    expect(res.body.restaurant).toBeUndefined();
    adminToken = res.body.token;
  });

  it('rejects a wrong password for the platform admin', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: adminEmail, password: 'wrong-password' });
    expect(res.status).toBe(400);
  });

  it('leaves normal tenant login completely unaffected', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: tenant.email, password: 'testpassword123' });
    expect(res.status).toBe(200);
    expect(res.body.platformAdmin).toBeUndefined();
    expect(res.body.user.email).toBe(tenant.email.toLowerCase());
    expect(res.body.restaurant.id).toBe(tenant.restaurantId);
  });
});

describe('platform admin console access control', () => {
  it('rejects requests with no token', async () => {
    const res = await request(app).get('/api/platform-admin/restaurants');
    expect(res.status).toBe(401);
  });

  it('rejects a normal tenant JWT — a restaurant login must never reach the console', async () => {
    const res = await request(app)
      .get('/api/platform-admin/restaurants')
      .set('Authorization', `Bearer ${(await request(app).post('/api/auth/login').send({ email: tenant.email, password: 'testpassword123' })).body.token}`);
    expect(res.status).toBe(403);
  });

  it('rejects a platform-admin token on a normal tenant-scoped route', async () => {
    const res = await request(app).get('/api/locations').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
  });
});

describe('platform admin tenant directory', () => {
  it('lists every restaurant with its owner email', async () => {
    const res = await request(app).get('/api/platform-admin/restaurants').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const found = res.body.restaurants.find((r) => r.id === tenant.restaurantId);
    expect(found).toBeTruthy();
    expect(found.owner.email).toBe(tenant.email.toLowerCase());
    expect(found.enabledPages).toEqual([]);
  });

  it('returns the page catalog', async () => {
    const res = await request(app).get('/api/platform-admin/page-catalog').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.pages.some((p) => p.key === 'page.pos')).toBe(true);
  });

  it('updates a restaurant enabledPages list, silently dropping invalid keys', async () => {
    const res = await request(app)
      .patch(`/api/platform-admin/restaurants/${tenant.restaurantId}/pages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pages: ['page.pos', 'page.orders', 'not-a-real-page'] });
    expect(res.status).toBe(200);
    expect(res.body.enabledPages.sort()).toEqual(['page.orders', 'page.pos']);
  });

  it('does not change any existing tenant-facing behavior — Sidebar/page routing is untouched by this toggle', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email: tenant.email, password: 'testpassword123' });
    const posRes = await request(app)
      .get('/api/menu')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .set('X-Location-Id', tenant.locationId);
    expect(posRes.status).toBe(200);
  });
});

describe('platform admin invite flow', () => {
  it('invites a new admin and the account exists but has no usable password yet', async () => {
    const res = await request(app)
      .post('/api/platform-admin/admins/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Second Admin', email: 'second-admin@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('second-admin@example.com');

    const listRes = await request(app).get('/api/platform-admin/admins').set('Authorization', `Bearer ${adminToken}`);
    const invited = listRes.body.admins.find((a) => a.email === 'second-admin@example.com');
    expect(invited.inviteAccepted).toBe(false);

    const loginAttempt = await request(app)
      .post('/api/auth/login')
      .send({ email: 'second-admin@example.com', password: 'whatever' });
    expect(loginAttempt.status).toBe(400);
  });

  it('lets the invitee set a password via the token and then log in', async () => {
    const rawToken = 'test-invite-token-12345';
    await PlatformAdmin.updateOne(
      { email: 'second-admin@example.com' },
      { passwordResetTokenHash: hashResetToken(rawToken), passwordResetExpires: new Date(Date.now() + 60000) }
    );

    const acceptRes = await request(app)
      .post('/api/platform-admin/accept-invite')
      .send({ token: rawToken, password: 'newpassword123' });
    expect(acceptRes.status).toBe(200);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'second-admin@example.com', password: 'newpassword123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.platformAdmin).toBe(true);

    const listRes = await request(app).get('/api/platform-admin/admins').set('Authorization', `Bearer ${adminToken}`);
    const invited = listRes.body.admins.find((a) => a.email === 'second-admin@example.com');
    expect(invited.inviteAccepted).toBe(true);
  });

  it('rejects an invalid or expired invite token', async () => {
    const res = await request(app)
      .post('/api/platform-admin/accept-invite')
      .send({ token: 'not-a-real-token', password: 'newpassword123' });
    expect(res.status).toBe(400);
  });

  it('rejects inviting a duplicate email', async () => {
    const res = await request(app)
      .post('/api/platform-admin/admins/invite')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dup', email: adminEmail });
    expect(res.status).toBe(400);
  });
});

describe('enabledPages enforcement plumbing', () => {
  it("login/settings responses carry the restaurant's enabledPages", async () => {
    const res = await request(app).post('/api/auth/login').send({ email: tenant.email, password: 'testpassword123' });
    expect(Array.isArray(res.body.restaurant.enabledPages)).toBe(true);
  });

  it('grandfathers a pre-existing restaurant (no enabledPages field at all) to full access', async () => {
    const raw = await Restaurant.collection.insertOne({
      name: 'Legacy Restaurant',
      slug: `legacy-${Date.now()}`,
      currency: 'Rs.',
      taxRatePercent: 8,
      createdAt: new Date(),
      updatedAt: new Date(),
      // enabledPages intentionally omitted — simulates a document that
      // existed before this field was added to the schema.
    });

    await migrateGrandfatherEnabledPages();

    const migrated = await Restaurant.findById(raw.insertedId).lean();
    expect(migrated.enabledPages.sort()).toEqual([...PAGE_PERMISSION_KEYS].sort());
  });

  it('leaves a restaurant that already has an explicit (even empty) enabledPages alone', async () => {
    const res = await request(app)
      .patch(`/api/platform-admin/restaurants/${tenant.restaurantId}/pages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pages: [] });
    expect(res.body.enabledPages).toEqual([]);

    await migrateGrandfatherEnabledPages();

    const unchanged = await Restaurant.findById(tenant.restaurantId).lean();
    expect(unchanged.enabledPages).toEqual([]);
  });

  it('a brand-new restaurant created via register() starts with enabledPages: []', async () => {
    const fresh = await createAuthedUser(app);
    const restaurant = await Restaurant.findById(fresh.restaurantId).lean();
    expect(restaurant.enabledPages).toEqual([]);
  });
});

describe('restaurant deletion', () => {
  it('wipes every restaurant-scoped collection and lets the same email register fresh', async () => {
    const restDel = await createAuthedUser(app);
    const restDelAuth = authedRequest(restDel.token, restDel.locationId);
    await restDelAuth(request(app).post('/api/expenses')).send({ category: 'rent', amount: 100, date: '2026-08-01' });

    expect(await Location.countDocuments({ restaurantId: restDel.restaurantId })).toBeGreaterThan(0);
    expect(await StaffMembership.countDocuments({ restaurantId: restDel.restaurantId })).toBeGreaterThan(0);

    const res = await request(app)
      .delete(`/api/platform-admin/restaurants/${restDel.restaurantId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.deletedUserCount).toBe(1);

    expect(await Restaurant.findById(restDel.restaurantId)).toBeNull();
    expect(await StaffMembership.countDocuments({ restaurantId: restDel.restaurantId })).toBe(0);
    expect(await Location.countDocuments({ restaurantId: restDel.restaurantId })).toBe(0);
    expect(await Expense.countDocuments({ restaurantId: restDel.restaurantId })).toBe(0);
    expect(await User.findOne({ email: restDel.email.toLowerCase() })).toBeNull();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: restDel.email, password: 'testpassword123' });
    expect(loginRes.status).toBe(400);

    const reregisterRes = await request(app).post('/api/auth/register').send({
      name: 'Fresh Owner',
      email: restDel.email,
      password: 'newpassword123',
      restaurantName: 'Reborn Restaurant',
    });
    expect(reregisterRes.status).toBe(201);
  });

  it('keeps a User who still has a membership at another restaurant', async () => {
    const restA = await createAuthedUser(app);
    const restB = await createAuthedUser(app);
    const sharedUser = await User.findOne({ email: restA.email.toLowerCase() });
    const roleB = await Role.findOne({ restaurantId: restB.restaurantId, name: 'Owner' });
    await StaffMembership.create({
      userId: sharedUser._id,
      restaurantId: restB.restaurantId,
      locationId: null,
      role: 'Owner',
      roleId: roleB._id,
    });

    const res = await request(app)
      .delete(`/api/platform-admin/restaurants/${restA.restaurantId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.deletedUserCount).toBe(0);

    expect(await User.findOne({ email: restA.email.toLowerCase() })).not.toBeNull();
    expect(
      await StaffMembership.countDocuments({ restaurantId: restB.restaurantId, userId: sharedUser._id })
    ).toBe(1);
  });

  it('requires platform admin auth', async () => {
    const rest = await createAuthedUser(app);
    const res = await request(app).delete(`/api/platform-admin/restaurants/${rest.restaurantId}`);
    expect(res.status).toBe(401);
  });

  it('404s for an unknown restaurant id', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .delete(`/api/platform-admin/restaurants/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Dashboard/Checklists page-access migration', () => {
  it('backfills page.dashboard and page.checklists onto every existing role', async () => {
    const rest = await createAuthedUser(app);
    const role = await Role.findOne({ restaurantId: rest.restaurantId, name: 'Owner' });
    // Simulate a role that existed before these two keys did.
    role.permissions = role.permissions.filter((p) => p !== 'page.dashboard' && p !== 'page.checklists');
    await role.save();

    await migrateUniversalPagesToExistingRoles();

    const updated = await Role.findById(role._id);
    expect(updated.permissions).toContain('page.dashboard');
    expect(updated.permissions).toContain('page.checklists');
  });

  it('extends a fully-grandfathered restaurant to include Dashboard/Checklists, but leaves a restricted one alone', async () => {
    const full = await createAuthedUser(app);
    const originalSeventeen = PAGE_PERMISSION_KEYS.filter(
      (k) => k !== 'page.dashboard' && k !== 'page.checklists'
    );
    await Restaurant.findByIdAndUpdate(full.restaurantId, { enabledPages: originalSeventeen });

    const restricted = await createAuthedUser(app);
    await Restaurant.findByIdAndUpdate(restricted.restaurantId, { enabledPages: ['page.pos'] });

    await migrateGrandfatherDashboardChecklists();

    const fullAfter = await Restaurant.findById(full.restaurantId).lean();
    expect(fullAfter.enabledPages).toContain('page.dashboard');
    expect(fullAfter.enabledPages).toContain('page.checklists');

    const restrictedAfter = await Restaurant.findById(restricted.restaurantId).lean();
    expect(restrictedAfter.enabledPages).toEqual(['page.pos']);
  });

  it('a brand-new restaurant has no default access to Dashboard or Checklists', async () => {
    const fresh = await createAuthedUser(app);
    const restaurant = await Restaurant.findById(fresh.restaurantId).lean();
    expect(restaurant.enabledPages).not.toContain('page.dashboard');
    expect(restaurant.enabledPages).not.toContain('page.checklists');
  });

  it("a brand-new restaurant's Owner role still has page.dashboard/page.checklists by default", async () => {
    const fresh = await createAuthedUser(app);
    const ownerRole = await Role.findOne({ restaurantId: fresh.restaurantId, name: 'Owner' });
    expect(ownerRole.permissions).toContain('page.dashboard');
    expect(ownerRole.permissions).toContain('page.checklists');
  });
});
