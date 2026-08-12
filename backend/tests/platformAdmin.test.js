import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';
import { createAuthedUser } from './helpers/auth.js';
import { hashResetToken } from '../utils/resetToken.js';
import PlatformAdmin from '../models/PlatformAdmin.js';
import Restaurant from '../models/Restaurant.js';
import { migrateGrandfatherEnabledPages } from '../services/enabledPagesMigrationService.js';
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
