import PlatformAdmin from '../models/PlatformAdmin.js';
import { logger } from '../middleware/logger.js';

// Idempotent, create-if-missing only — run on every boot alongside the other
// migrations in server.js. Never touches an existing record, so a password
// changed later from inside the console persists across restarts even
// though the .env value never changes.
export async function seedPlatformAdmin() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!email || !password) {
    logger.warn('PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PASSWORD not set — skipping platform admin seed.');
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await PlatformAdmin.findOne({ email: normalizedEmail });
  if (existing) return;

  await PlatformAdmin.create({
    name: 'Platform Owner',
    email: normalizedEmail,
    password,
    isSeedAccount: true,
  });
  logger.info({ email: normalizedEmail }, 'Seeded platform admin account.');
}
