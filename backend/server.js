import 'dotenv/config';
import http from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { logger } from './middleware/logger.js';
import { initSocket } from './realtime/socket.js';
import { seedInitialData } from './services/seedService.js';
import { migrateOrdersToCustomers } from './services/customerService.js';

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
    await seedInitialData();
    await migrateOrdersToCustomers();
  })
  .catch((err) => logger.fatal({ err }, 'MongoDB connection error'));

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
initSocket(httpServer, ALLOWED_ORIGINS);
httpServer.listen(PORT, () => logger.info(`Nexus POS Server running on http://localhost:${PORT}`));
