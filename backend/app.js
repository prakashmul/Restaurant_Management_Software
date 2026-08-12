import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { requireAuth, resolveLocationScope } from './middleware/auth.js';
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
import staffRoutes from './routes/staffRoutes.js';
import rolesRoutes from './routes/rolesRoutes.js';
import recipeCostingRoutes from './routes/recipeCostingRoutes.js';
import checklistsRoutes from './routes/checklistsRoutes.js';
import schedulingRoutes from './routes/schedulingRoutes.js';
import procurementRoutes from './routes/procurementRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import locationsRoutes from './routes/locationsRoutes.js';
import headOfficeRoutes from './routes/headOfficeRoutes.js';
import transfersRoutes from './routes/transfersRoutes.js';
import customersRoutes from './routes/customersRoutes.js';
import restaurantRoutes from './routes/restaurantRoutes.js';
import reservationsRoutes from './routes/reservationsRoutes.js';
import expensesRoutes from './routes/expensesRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import platformAdminRoutes from './routes/platformAdminRoutes.js';

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
  // Its own auth (requirePlatformAdmin) — a platform admin is not a tenant
  // user, so this must not sit behind the tenant-scoped middleware below.
  app.use('/api/platform-admin', platformAdminRoutes);

  // Every route registered below this line requires a valid Bearer token,
  // and has req.locationId resolved (see resolveLocationScope).
  app.use(requireAuth);
  app.use(resolveLocationScope);

  app.use('/api/categories', categoriesRoutes);
  app.use('/api/menu', menuRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/tables', tablesRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/credits', creditsRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/roles', rolesRoutes);
  app.use('/api/recipe-costing', recipeCostingRoutes);
  app.use('/api/checklists', checklistsRoutes);
  app.use('/api/scheduling', schedulingRoutes);
  app.use('/api/procurement', procurementRoutes);
  app.use('/api/audit-log', auditRoutes);
  app.use('/api/locations', locationsRoutes);
  app.use('/api/head-office', headOfficeRoutes);
  app.use('/api/transfers', transfersRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/restaurant', restaurantRoutes);
  app.use('/api/reservations', reservationsRoutes);
  app.use('/api/expenses', expensesRoutes);
  app.use('/api/dashboard', dashboardRoutes);

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
