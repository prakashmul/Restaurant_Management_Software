import Restaurant from '../models/Restaurant.js';
import { PAGE_PERMISSION_KEYS } from '../permissions.js';
import { logger } from '../middleware/logger.js';

// A restaurant created before the Platform Admin Console feature never had
// `enabledPages` written to its document at all — that's what distinguishes
// it from one a platform admin has since deliberately narrowed to zero
// pages (which has the field, just set to []). Grandfathers only the former
// group in with full access, so turning on enforcement (Sidebar + PageGuard
// ANDing this with the existing per-role Page Access permissions) never
// locks a restaurant that was already working out of its own pages.
export async function migrateGrandfatherEnabledPages() {
  const result = await Restaurant.updateMany(
    { enabledPages: { $exists: false } },
    { $set: { enabledPages: [...PAGE_PERMISSION_KEYS] } }
  );
  if (result.modifiedCount > 0) {
    logger.info({ count: result.modifiedCount }, 'Grandfathered enabledPages for pre-existing restaurants.');
  }
}

// The page.* catalog as it stood before Dashboard/Checklists joined it — a
// literal snapshot, not derived from the live PAGE_PERMISSION_KEYS (which
// now includes both), so this migration's own definition of "had everything"
// never drifts as the catalog grows further in the future.
const ORIGINAL_SEVENTEEN_PAGE_KEYS = [
  'page.pos', 'page.kitchen', 'page.inventory', 'page.orders', 'page.credits', 'page.customers',
  'page.reservations', 'page.headoffice', 'page.recipecosting', 'page.scheduling', 'page.procurement',
  'page.transfers', 'page.staff', 'page.locations', 'page.auditlog', 'page.settings', 'page.expenses',
];

// Dashboard and Checklists just became real page.* keys, subject to the
// platform admin's enabledPages toggle for the first time — previously
// every restaurant had them unconditionally. A restaurant currently holding
// every one of the original 17 keys was effectively unrestricted, so it
// keeps that same "has everything" status as the catalog grows. A
// restaurant the platform admin had already deliberately narrowed down
// (fewer than all 17) is left exactly as-is — new pages require the same
// explicit grant as any other page, matching how a brand-new signup works.
// Idempotent, additive-only, safe to run on every boot.
export async function migrateGrandfatherDashboardChecklists() {
  const restaurants = await Restaurant.find({
    enabledPages: { $all: ORIGINAL_SEVENTEEN_PAGE_KEYS },
  }).select('enabledPages');

  let updatedCount = 0;
  for (const restaurant of restaurants) {
    const missing = ['page.dashboard', 'page.checklists'].filter(
      (k) => !restaurant.enabledPages.includes(k)
    );
    if (missing.length === 0) continue;

    restaurant.enabledPages = [...restaurant.enabledPages, ...missing];
    await restaurant.save();
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    logger.info({ count: updatedCount }, 'Extended full-access restaurants to include Dashboard/Checklists.');
  }
}
