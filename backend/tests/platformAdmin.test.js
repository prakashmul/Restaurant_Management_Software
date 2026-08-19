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
import Plan from '../models/Plan.js';
import { seedDefaultPlans } from '../services/planSeedService.js';

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
    // createAuthedUser provisions a fully-enabled restaurant by default (see
    // helpers/auth.js) — the true register()-only default is covered
    // separately below, in 'enabledPages enforcement plumbing'.
    expect(found.enabledPages.sort()).toEqual([...PAGE_PERMISSION_KEYS].sort());
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

  it('is now enforced server-side too, not just hidden in the Sidebar', async () => {
    // The PATCH above restricted this tenant to just page.orders/page.pos —
    // menu.view requires page.inventory, which is no longer enabled, so the
    // backend itself must reject this, not just the frontend Sidebar.
    const loginRes = await request(app).post('/api/auth/login').send({ email: tenant.email, password: 'testpassword123' });
    const menuRes = await request(app)
      .get('/api/menu')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .set('X-Location-Id', tenant.locationId);
    expect(menuRes.status).toBe(403);

    // A route requiring only a still-enabled page keeps working.
    const tablesRes = await request(app)
      .get('/api/tables')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .set('X-Location-Id', tenant.locationId);
    expect(tablesRes.status).toBe(200);
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
    // createAuthedUser deliberately provisions full access for the rest of
    // the suite (see helpers/auth.js) — call register() directly here to
    // see the real, unmodified default.
    const registerRes = await request(app).post('/api/auth/register').send({
      name: 'Raw Register Test',
      email: `raw-register-${Date.now()}@example.com`,
      password: 'testpassword123',
      restaurantName: `Raw Register Restaurant ${Date.now()}`,
    });
    const restaurant = await Restaurant.findById(registerRes.body.restaurant.id).lean();
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
    // Same reason as above — bypass createAuthedUser's default provisioning
    // to see register()'s real, unmodified output.
    const registerRes = await request(app).post('/api/auth/register').send({
      name: 'Raw Register Test 2',
      email: `raw-register-2-${Date.now()}@example.com`,
      password: 'testpassword123',
      restaurantName: `Raw Register Restaurant 2 ${Date.now()}`,
    });
    const restaurant = await Restaurant.findById(registerRes.body.restaurant.id).lean();
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

describe('subscription plans', () => {
  it('seeds exactly the three default plans, idempotently', async () => {
    await seedDefaultPlans();
    await seedDefaultPlans(); // second call must not create duplicates

    const slugs = (await Plan.find().select('slug').lean()).map((p) => p.slug).sort();
    expect(slugs).toEqual(['enterprise', 'growth', 'starter']);

    const growth = await Plan.findOne({ slug: 'growth' });
    expect(growth.pages).toContain('page.pos');
    expect(growth.pages).toContain('page.kitchen');
    expect(growth.pages).not.toContain('page.headoffice');

    const enterprise = await Plan.findOne({ slug: 'enterprise' });
    expect(enterprise.pages.sort()).toEqual([...PAGE_PERMISSION_KEYS].sort());
  });

  it('lists plans with a restaurantCount, requires platform admin auth', async () => {
    const unauthed = await request(app).get('/api/platform-admin/plans');
    expect(unauthed.status).toBe(401);

    const res = await request(app).get('/api/platform-admin/plans').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.plans.length).toBeGreaterThanOrEqual(3);
    expect(res.body.plans[0]).toHaveProperty('restaurantCount');
  });

  it('creates a plan, rejects a duplicate slug, edits its price and pages', async () => {
    const createRes = await request(app)
      .post('/api/platform-admin/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bar Only', slug: 'bar-only-test', priceMonthly: 1500, priceAnnual: 15000, pages: ['page.pos'] });
    expect(createRes.status).toBe(201);

    const dupRes = await request(app)
      .post('/api/platform-admin/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bar Only Again', slug: 'bar-only-test', priceMonthly: 1000, priceAnnual: 10000 });
    expect(dupRes.status).toBe(400);

    const editRes = await request(app)
      .put(`/api/platform-admin/plans/${createRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ priceMonthly: 1800, pages: ['page.pos', 'page.orders'] });
    expect(editRes.status).toBe(200);
    expect(editRes.body.priceMonthly).toBe(1800);
    expect(editRes.body.pages.sort()).toEqual(['page.orders', 'page.pos']);
  });

  it('blocks deleting a plan that a restaurant is still on, allows it once reassigned', async () => {
    const plan = await Plan.create({ name: 'Delete Me', slug: `delete-me-${Date.now()}`, priceMonthly: 100, priceAnnual: 1000, pages: ['page.pos'] });
    const rest = await createAuthedUser(app);
    await Restaurant.findByIdAndUpdate(rest.restaurantId, { planId: plan._id });

    const blockedRes = await request(app)
      .delete(`/api/platform-admin/plans/${plan._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(blockedRes.status).toBe(400);

    await Restaurant.findByIdAndUpdate(rest.restaurantId, { planId: null });

    const allowedRes = await request(app)
      .delete(`/api/platform-admin/plans/${plan._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(allowedRes.status).toBe(200);
  });

  it('assigning a plan adds its pages to enabledPages without removing a manually-granted extra page', async () => {
    await seedDefaultPlans();
    const growth = await Plan.findOne({ slug: 'growth' });
    const enterprise = await Plan.findOne({ slug: 'enterprise' });

    const rest = await createAuthedUser(app);
    // This test is specifically about the additive-union starting from a
    // real baseline — createAuthedUser provisions full access by default
    // for the rest of the suite, so reset to empty here first.
    await Restaurant.findByIdAndUpdate(rest.restaurantId, { enabledPages: [] });

    // Assign Growth first.
    const assignRes = await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: growth._id.toString() });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.enabledPages.sort()).toEqual([...growth.pages].sort());

    // The admin hand-grants an Enterprise-only page Growth doesn't include —
    // the exact "comp a friend an extra page" scenario.
    expect(growth.pages).not.toContain('page.headoffice');
    const grantRes = await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/pages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pages: [...growth.pages, 'page.headoffice'] });
    expect(grantRes.body.enabledPages).toContain('page.headoffice');

    // Restaurant later changes plan — still Growth, e.g. a renewal — the
    // manually-granted page.headoffice must survive.
    const reassignRes = await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: growth._id.toString() });
    expect(reassignRes.body.enabledPages).toContain('page.headoffice');
    expect(reassignRes.body.enabledPages.sort()).toEqual([...new Set([...growth.pages, 'page.headoffice'])].sort());

    // Upgrading to Enterprise only ever adds pages on top of that, never drops the manual grant either.
    const upgradeRes = await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: enterprise._id.toString() });
    expect(upgradeRes.body.planName).toBe('Enterprise');
    expect(upgradeRes.body.enabledPages.sort()).toEqual([...enterprise.pages].sort());

    const restaurantAfter = await Restaurant.findById(rest.restaurantId).lean();
    expect(String(restaurantAfter.planId)).toBe(String(enterprise._id));
  });

  it('downgrading via assign keeps the higher plan\'s pages until an explicit reset', async () => {
    await seedDefaultPlans();
    const growth = await Plan.findOne({ slug: 'growth' });
    const enterprise = await Plan.findOne({ slug: 'enterprise' });

    const rest = await createAuthedUser(app);
    await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: enterprise._id.toString() });

    // Picking Growth from the dropdown after being on Enterprise — the
    // exact scenario reported: the plan name changes, but pages don't
    // shrink, because assign is additive-only by design.
    const downgradeRes = await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: growth._id.toString() });
    expect(downgradeRes.body.planName).toBe('Growth');
    expect(downgradeRes.body.enabledPages.sort()).toEqual([...enterprise.pages].sort());

    // The explicit reset action is what actually shrinks it, to exactly
    // the currently-assigned plan's (Growth's) pages.
    const resetRes = await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan/reset`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.planName).toBe('Growth');
    expect(resetRes.body.enabledPages.sort()).toEqual([...growth.pages].sort());

    const restaurantAfter = await Restaurant.findById(rest.restaurantId).lean();
    expect(restaurantAfter.enabledPages.sort()).toEqual([...growth.pages].sort());
  });

  it('reset also strips a manually-granted extra page, since it targets exactly the plan defaults', async () => {
    await seedDefaultPlans();
    const growth = await Plan.findOne({ slug: 'growth' });
    const rest = await createAuthedUser(app);
    await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: growth._id.toString() });
    await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/pages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pages: [...growth.pages, 'page.headoffice'] });

    const resetRes = await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan/reset`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resetRes.body.enabledPages).not.toContain('page.headoffice');
    expect(resetRes.body.enabledPages.sort()).toEqual([...growth.pages].sort());
  });

  it('reset requires a plan to already be assigned, and requires auth', async () => {
    const rest = await createAuthedUser(app);

    const noPlanRes = await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan/reset`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(noPlanRes.status).toBe(400);

    const unauthedRes = await request(app).patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan/reset`);
    expect(unauthedRes.status).toBe(401);
  });

  it('404s assigning an unknown plan or to an unknown restaurant', async () => {
    const growth = await Plan.findOne({ slug: 'growth' });
    const rest = await createAuthedUser(app);
    const fakeId = new mongoose.Types.ObjectId();

    const badPlan = await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: fakeId.toString() });
    expect(badPlan.status).toBe(404);

    const badRestaurant = await request(app)
      .patch(`/api/platform-admin/restaurants/${fakeId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: growth._id.toString() });
    expect(badRestaurant.status).toBe(404);
  });

  it('surfaces the assigned plan name (read-only) on tenant login and GET /restaurant', async () => {
    const growth = await Plan.findOne({ slug: 'growth' });
    const rest = await createAuthedUser(app);
    const restAuth = authedRequest(rest.token, rest.locationId);

    const loginBefore = await request(app).post('/api/auth/login').send({ email: rest.email, password: 'testpassword123' });
    expect(loginBefore.body.restaurant.planName).toBeNull();

    await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: growth._id.toString() });

    const loginAfter = await request(app).post('/api/auth/login').send({ email: rest.email, password: 'testpassword123' });
    expect(loginAfter.body.restaurant.planName).toBe('Growth');

    const settingsRes = await restAuth(request(app).get('/api/restaurant'));
    expect(settingsRes.body.planName).toBe('Growth');
  });

  it('listRestaurants reports the assigned plan name', async () => {
    const growth = await Plan.findOne({ slug: 'growth' });
    const rest = await createAuthedUser(app);
    await request(app)
      .patch(`/api/platform-admin/restaurants/${rest.restaurantId}/plan`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ planId: growth._id.toString() });

    const listRes = await request(app).get('/api/platform-admin/restaurants').set('Authorization', `Bearer ${adminToken}`);
    const row = listRes.body.restaurants.find((r) => r.id === rest.restaurantId);
    expect(row.planName).toBe('Growth');
  });
});
