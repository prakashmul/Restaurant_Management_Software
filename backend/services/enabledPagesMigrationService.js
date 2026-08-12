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
