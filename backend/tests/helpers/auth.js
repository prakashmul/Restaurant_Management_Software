import request from 'supertest';
import User from '../../models/User.js';

let counter = 0;

// Registers + logs in a fresh user and returns their token. Each call uses a
// unique email so tests don't need to reset the database between them.
// Pass { role: 'Owner' } to promote the account *before* login — the JWT
// bakes in the role at issuance time, so promoting after login wouldn't be
// reflected until the user re-authenticates.
export async function createAuthedUser(app, overrides = {}) {
  counter += 1;
  const email = overrides.email || `user${Date.now()}${counter}@example.com`;
  const password = overrides.password || 'testpassword123';
  const name = overrides.name || 'Test User';

  await request(app).post('/api/auth/register').send({ name, email, password });
  if (overrides.role === 'Owner') {
    await promoteToOwner(email);
  }
  const loginRes = await request(app).post('/api/auth/login').send({ email, password });

  return { token: loginRes.body.token, email };
}

export async function promoteToOwner(email) {
  await User.updateOne({ email }, { role: 'Owner' });
}
