import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../../app.js';

// Boots an isolated in-memory MongoDB replica set (needed for
// session.withTransaction — a plain standalone instance can't run
// transactions) and a fresh Express app pointed at it. Nothing here ever
// touches the real Atlas database.
export async function setupTestApp() {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-not-for-production';

  const replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  await mongoose.connect(uri);

  const app = createApp({ allowedOrigins: [] });

  return {
    app,
    async teardown() {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
      await replset.stop();
    },
  };
}
