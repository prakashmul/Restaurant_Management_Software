import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requireAuth } from './middleware/auth.js';
import { requestLogger } from './middleware/logger.js';

import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import categoriesRoutes from './routes/categoriesRoutes.js';
import menuRoutes from './routes/menuRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import tablesRoutes from './routes/tablesRoutes.js';
import ordersRoutes from './routes/ordersRoutes.js';
import creditsRoutes from './routes/creditsRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';

// Builds the Express app with no side effects — no DB connection, no
// listen() — so it can be mounted by server.js for real traffic or
// imported directly by tests via supertest.
export function createApp({ allowedOrigins }) {
  const app = express();

  app.use(requestLogger);
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser tools (curl/Postman, and supertest) that send no
        // Origin header, but reject any browser origin not explicitly allow-listed.
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    })
  );
  app.use(express.json());

  // General ceiling on API traffic per IP.
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use(healthRoutes);
  app.use('/api/auth', authRoutes);

  // Every route registered below this line requires a valid Bearer token.
  app.use(requireAuth);

  app.use('/api/categories', categoriesRoutes);
  app.use('/api/menu', menuRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/tables', tablesRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/credits', creditsRoutes);
  app.use('/api/attendance', attendanceRoutes);

  // --- 404 FOR UNMATCHED ROUTES ---
  app.use((req, res) => {
    res.status(404).json({ message: `No route matches ${req.method} ${req.originalUrl}` });
  });

  // --- CENTRALIZED ERROR HANDLER ---
  // Catches anything passed to next(err) (validation middleware, CORS rejection)
  // plus malformed-JSON body errors from express.json(), instead of letting
  // Express fall back to its default HTML error page.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return res.status(400).json({ message: 'Malformed JSON in request body.' });
    }
    if (err.message?.startsWith('Origin ') && err.message?.endsWith('not allowed by CORS')) {
      return res.status(403).json({ message: 'This origin is not allowed to access the API.' });
    }
    req.log.error({ err }, 'Unhandled error');
    const status = err.status || 500;
    res.status(status).json({ message: err.status ? err.message : 'Internal server error.' });
  });

  return app;
}
