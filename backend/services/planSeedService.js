import Plan from '../models/Plan.js';
import { logger } from '../middleware/logger.js';

// Starter's page list stops at what a single-location restaurant needs to
// run day-to-day service and staff a handful of accounts.
const STARTER_PAGES = [
  'page.dashboard', 'page.pos', 'page.orders', 'page.inventory',
  'page.customers', 'page.credits', 'page.staff', 'page.settings',
];

// Growth adds real shift-operations depth on top of Starter.
const GROWTH_PAGES = [
  ...STARTER_PAGES,
  'page.kitchen', 'page.reservations', 'page.recipecosting',
  'page.checklists', 'page.scheduling', 'page.procurement', 'page.expenses',
];

// Enterprise is everything — the remaining keys only matter once a
// restaurant runs more than one location.
const ENTERPRISE_PAGES = [
  ...GROWTH_PAGES,
  'page.locations', 'page.transfers', 'page.headoffice', 'page.auditlog',
];

const DEFAULT_PLANS = [
  { name: 'Starter', slug: 'starter', priceMonthly: 2500, priceAnnual: 25000, perLocationPrice: 0, pages: STARTER_PAGES, sortOrder: 1 },
  { name: 'Growth', slug: 'growth', priceMonthly: 5500, priceAnnual: 55000, perLocationPrice: 0, pages: GROWTH_PAGES, sortOrder: 2 },
  { name: 'Enterprise', slug: 'enterprise', priceMonthly: 12000, priceAnnual: 120000, perLocationPrice: 3000, pages: ENTERPRISE_PAGES, sortOrder: 3 },
];

// Idempotent, create-if-missing only — run on every boot alongside the other
// seed/migration steps. Never touches a plan that already exists (by slug),
// so a price or page list edited later from the Plans tab persists across
// restarts even though this default definition never changes.
export async function seedDefaultPlans() {
  let createdCount = 0;
  for (const def of DEFAULT_PLANS) {
    const existing = await Plan.findOne({ slug: def.slug });
    if (existing) continue;
    await Plan.create(def);
    createdCount += 1;
  }
  if (createdCount > 0) {
    logger.info({ count: createdCount }, 'Seeded default subscription plans.');
  }
}
