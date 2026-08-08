import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { generate as generateTotp } from 'otplib';
import { setupTestApp } from './helpers/testApp.js';
import User from '../models/User.js';
import { hashResetToken } from '../utils/resetToken.js';

let app;
let teardown;

beforeAll(async () => {
  ({ app, teardown } = await setupTestApp());
}, 60000);

afterAll(async () => {
  await teardown();
});

describe('auth', () => {
  it('registers a new restaurant and makes the registering user its Owner', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: 'register-test@example.com',
      password: 'testpassword123',
      restaurantName: "Register Test's Diner",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('Owner');
    expect(res.body.restaurant.name).toBe("Register Test's Diner");
  });

  it('rejects registration missing a restaurant name', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'norestaurant@example.com', password: 'testpassword123' });
    expect(res.status).toBe(400);
  });

  it('rejects passwords under 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: 'weakpass@example.com',
      password: 'short',
      restaurantName: 'Weak Pass Diner',
    });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate email registration', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Test User',
      email: 'dup@example.com',
      password: 'testpassword123',
      restaurantName: 'Dup Diner',
    });
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test User 2',
      email: 'dup@example.com',
      password: 'testpassword123',
      restaurantName: 'Dup Diner 2',
    });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials and issues a JWT scoped to the restaurant', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Login User',
      email: 'login-ok@example.com',
      password: 'testpassword123',
      restaurantName: 'Login Ok Diner',
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login-ok@example.com', password: 'testpassword123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('Owner');
    expect(res.body.restaurant.name).toBe('Login Ok Diner');
  });

  it('rejects the wrong password without leaking whether the account exists', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Login User',
      email: 'wrongpass@example.com',
      password: 'testpassword123',
      restaurantName: 'Wrong Pass Diner',
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrongpass@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('rejects requests to protected routes with no token', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a malformed/invalid token', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('never returns the password hash in any response', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'No Leak',
      email: 'noleak@example.com',
      password: 'testpassword123',
      restaurantName: 'No Leak Diner',
    });
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('testpassword123');
  });
});

describe('forgot / reset password', () => {
  const email = 'forgot-user@example.com';
  const originalPassword = 'testpassword123';

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Forgot User',
      email,
      password: originalPassword,
      restaurantName: 'Forgot Diner',
    });
  });

  it('issues a reset token on request and returns the same generic message either way', async () => {
    const realRes = await request(app).post('/api/auth/forgot-password').send({ email });
    const fakeRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'no-such-account@example.com' });

    expect(realRes.status).toBe(200);
    expect(fakeRes.status).toBe(200);
    expect(realRes.body.message).toBe(fakeRes.body.message);

    const user = await User.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpires');
    expect(user.passwordResetTokenHash).toBeTruthy();
    expect(user.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects an invalid or garbage token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-real-token', password: 'somenewpassword1' });
    expect(res.status).toBe(400);
  });

  it('rejects an expired token', async () => {
    const rawToken = 'expired-token-xyz';
    await User.findOneAndUpdate(
      { email },
      { passwordResetTokenHash: hashResetToken(rawToken), passwordResetExpires: new Date(Date.now() - 1000) }
    );
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'somenewpassword1' });
    expect(res.status).toBe(400);
  });

  it('resets the password with a valid token, and the old password stops working', async () => {
    const rawToken = 'valid-token-xyz';
    await User.findOneAndUpdate(
      { email },
      { passwordResetTokenHash: hashResetToken(rawToken), passwordResetExpires: new Date(Date.now() + 60000) }
    );

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'brandnewpassword1' });
    expect(resetRes.status).toBe(200);

    const oldLoginRes = await request(app).post('/api/auth/login').send({ email, password: originalPassword });
    expect(oldLoginRes.status).toBe(400);

    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'brandnewpassword1' });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.token).toBeTruthy();

    // The token is single-use — a second attempt with the same raw token
    // must fail now that it's been cleared on successful reset.
    const reuseRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, password: 'anotherpassword1' });
    expect(reuseRes.status).toBe(400);
  });
});

describe('TOTP two-factor authentication', () => {
  const email = 'totp-user@example.com';
  const password = 'testpassword123';
  let token;
  let secret;

  beforeAll(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Totp User',
      email,
      password,
      restaurantName: 'Totp Diner',
    });
    const loginRes = await request(app).post('/api/auth/login').send({ email, password });
    token = loginRes.body.token;
  });

  it('reports 2FA as disabled by default', async () => {
    const res = await request(app).get('/api/auth/2fa/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totpEnabled).toBe(false);
  });

  it('rejects enabling 2FA with a wrong code', async () => {
    const setupRes = await request(app).post('/api/auth/2fa/setup').set('Authorization', `Bearer ${token}`);
    expect(setupRes.status).toBe(200);
    secret = setupRes.body.secret;
    expect(secret).toBeTruthy();

    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: '000000' });
    expect(res.status).toBe(400);
  });

  it('does not gate login while setup is unconfirmed', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('lets the user confirm setup with a valid code, then requires a code at login', async () => {
    const enableRes = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: await generateTotp({ secret }) });
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.totpEnabled).toBe(true);

    const statusRes = await request(app).get('/api/auth/2fa/status').set('Authorization', `Bearer ${token}`);
    expect(statusRes.body.totpEnabled).toBe(true);

    const loginNoCodeRes = await request(app).post('/api/auth/login').send({ email, password });
    expect(loginNoCodeRes.status).toBe(200);
    expect(loginNoCodeRes.body.requiresTotp).toBe(true);
    expect(loginNoCodeRes.body.token).toBeUndefined();

    const loginBadCodeRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password, totpToken: '000000' });
    expect(loginBadCodeRes.status).toBe(400);

    const loginGoodCodeRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password, totpToken: await generateTotp({ secret }) });
    expect(loginGoodCodeRes.status).toBe(200);
    expect(loginGoodCodeRes.body.token).toBeTruthy();
  });

  it('refuses to start a new setup while 2FA is already enabled', async () => {
    const res = await request(app).post('/api/auth/2fa/setup').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('rejects disabling 2FA with a wrong code, then disables with a correct one', async () => {
    const badRes = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: '000000' });
    expect(badRes.status).toBe(400);

    const statusRes = await request(app).get('/api/auth/2fa/status').set('Authorization', `Bearer ${token}`);
    expect(statusRes.body.totpEnabled).toBe(true);

    const goodRes = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: await generateTotp({ secret }) });
    expect(goodRes.status).toBe(200);
    expect(goodRes.body.totpEnabled).toBe(false);

    const loginRes = await request(app).post('/api/auth/login').send({ email, password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeTruthy();
  });
});
