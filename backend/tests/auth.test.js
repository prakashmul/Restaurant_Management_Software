import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestApp } from './helpers/testApp.js';

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
