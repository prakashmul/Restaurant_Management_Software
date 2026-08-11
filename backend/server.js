import 'dotenv/config';
import http from 'node:http';
import mongoose from 'mongoose';
import cron from 'node-cron';
import { createApp } from './app.js';
import { logger } from './middleware/logger.js';
import { initSocket } from './realtime/socket.js';
import { migrateToMultiTenant } from './services/tenantMigrationService.js';
import { migrateToLocations } from './services/locationMigrationService.js';
import { migrateLocationCurrency } from './services/locationCurrencyMigrationService.js';
import { migrateToLocationStock } from './services/inventoryStockMigrationService.js';
import { migrateToRoles, syncBuiltInRolePermissions, migrateCustomRolePageAccess } from './services/roleMigrationService.js';
import { migrateOrdersToCustomers } from './services/customerService.js';
import { checkLowStockAndAlert } from './services/lowStockAlertService.js';
import { sendDailySummaries } from './services/summaryReportService.js';

// --- REQUIRED ENVIRONMENT VARIABLES ---
// Accepts either name — the Atlas-generated .env uses MONGODB_URI.
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!MONGO_URI) {
  logger.fatal('MONGO_URI (or MONGODB_URI) is not set. Check your .env file.');
  process.exit(1);
}
if (!JWT_SECRET) {
  logger.fatal('JWT_SECRET is not set. Check your .env file.');
  process.exit(1);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const app = createApp({ allowedOrigins: ALLOWED_ORIGINS });

// --- MONGODB CONNECTION ---
mongoose
  .connect(MONGO_URI)
  .then(async () => {
    logger.info('Connected to MongoDB!');
    await migrateToMultiTenant();
    await migrateToLocations();
    await migrateLocationCurrency();
    await migrateToLocationStock();
    await migrateToRoles();
    await syncBuiltInRolePermissions();
    await migrateCustomRolePageAccess();
    await migrateOrdersToCustomers();

    // Low stock: checked every 6 hours, but lowStockAlertService itself only
    // actually emails once a day per location — see its cooldown logic.
    cron.schedule('0 */6 * * *', () => {
      checkLowStockAndAlert().catch((err) => logger.error({ err }, 'Low-stock alert job failed'));
    });

    // Daily summary: once a day, late enough that the day's orders are done.
    cron.schedule('30 23 * * *', () => {
      sendDailySummaries().catch((err) => logger.error({ err }, 'Daily summary job failed'));
    });
  })
  .catch((err) => logger.fatal({ err }, 'MongoDB connection error'));

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
initSocket(httpServer, ALLOWED_ORIGINS);
httpServer.listen(PORT, () => logger.info(`Nexus POS Server running on http://localhost:${PORT}`));
