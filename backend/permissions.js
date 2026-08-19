// The full set of grantable permissions, grouped the same way the Roles &
// Permissions UI groups them. A role (built-in or custom) is just a name +
// a subset of this list.
export const PERMISSION_SECTIONS = [
  {
    // Coarse, page-level gate — a role without a page's key here never sees
    // it in the sidebar and can't reach it by URL either, regardless of
    // what finer per-action permissions (below) it's also been granted.
    // Dashboard and Checklists used to be excluded from this list entirely
    // (unconditionally visible to every role) — they're real page.* keys
    // now too, same as everything else here. checklistsRoutes.js's GET
    // /today route is still open to any authenticated staff member
    // regardless of role — that's a separate, API-level concern from this
    // page-level Sidebar/PageGuard gate.
    key: 'pages',
    label: 'Page Access',
    permissions: [
      { key: 'page.dashboard', label: 'Dashboard' },
      { key: 'page.pos', label: 'POS System' },
      { key: 'page.kitchen', label: 'Kitchen Display' },
      { key: 'page.inventory', label: 'Inventory' },
      { key: 'page.orders', label: 'Order History' },
      { key: 'page.credits', label: 'Credit Ledger' },
      { key: 'page.customers', label: 'Customers' },
      { key: 'page.reservations', label: 'Reservations' },
      { key: 'page.headoffice', label: 'Head Office' },
      { key: 'page.recipecosting', label: 'Recipe Costing' },
      { key: 'page.checklists', label: 'Checklists' },
      { key: 'page.scheduling', label: 'Staff Schedule' },
      { key: 'page.procurement', label: 'Procurement' },
      { key: 'page.transfers', label: 'Transfers' },
      { key: 'page.staff', label: 'Users & Roles' },
      { key: 'page.locations', label: 'Locations' },
      { key: 'page.auditlog', label: 'Audit Log' },
      { key: 'page.settings', label: 'Settings' },
      { key: 'page.expenses', label: 'Expenses' },
    ],
  },
  {
    key: 'general',
    label: 'General',
    permissions: [
      { key: 'dash', label: 'View Dashboard', requiresPage: 'page.dashboard' },
      { key: 'tables', label: 'View & edit tables', requiresPage: 'page.pos' },
      { key: 'staff.view', label: 'View staff list', requiresPage: 'page.staff' },
      { key: 'customers', label: 'View & edit customers', requiresPage: 'page.customers' },
    ],
  },
  {
    key: 'orders',
    label: 'Orders & Payment',
    permissions: [
      { key: 'orders.view', label: 'View orders', requiresPage: 'page.pos' },
      { key: 'orders.edit', label: 'Create / edit orders', requiresPage: 'page.pos' },
      { key: 'orders.checkout', label: 'Checkout & take payment', requiresPage: 'page.pos' },
      { key: 'orders.void', label: 'Void / cancel an order', requiresPage: 'page.pos' },
      { key: 'orders.discount', label: 'Apply discounts', requiresPage: 'page.pos' },
      { key: 'orders.tip', label: 'Add / edit tips', requiresPage: 'page.pos' },
      { key: 'orders.credit', label: 'Record on customer credit', requiresPage: 'page.pos' },
      { key: 'orders.refund', label: 'Refund a paid, credited, or settled order', requiresPage: 'page.orders' },
    ],
  },
  {
    key: 'menu',
    label: 'Menu & Inventory',
    permissions: [
      { key: 'menu.view', label: 'View menu & categories', requiresPage: 'page.inventory' },
      { key: 'menu.edit', label: 'Edit menu, prices & categories', requiresPage: 'page.inventory' },
      { key: 'stock.view', label: 'View stock levels', requiresPage: 'page.inventory' },
      { key: 'stock.edit', label: 'Restock / adjust inventory', requiresPage: 'page.inventory' },
      { key: 'stock.history', label: 'View stock movement history', requiresPage: 'page.inventory' },
    ],
  },
  {
    key: 'credit',
    label: 'Credit Ledger',
    permissions: [
      { key: 'credit.view', label: 'View credit ledger', requiresPage: 'page.credits' },
      { key: 'credit.settle', label: 'Settle / write off balances', requiresPage: 'page.credits' },
    ],
  },
  {
    key: 'procurement',
    label: 'Procurement & Transfers',
    permissions: [
      { key: 'procurement.view', label: 'View vendors & purchase orders', requiresPage: 'page.procurement' },
      { key: 'procurement.manage', label: 'Manage vendors & purchase orders', requiresPage: 'page.procurement' },
      { key: 'transfers.view', label: 'View inter-location transfers', requiresPage: 'page.transfers' },
      { key: 'transfers.manage', label: 'Send, receive & cancel transfers', requiresPage: 'page.transfers' },
    ],
  },
  {
    key: 'operations',
    label: 'Scheduling & Checklists',
    permissions: [
      { key: 'scheduling.view', label: 'View the staff schedule', requiresPage: 'page.scheduling' },
      { key: 'scheduling.manage', label: 'Create shifts & view labor variance', requiresPage: 'page.scheduling' },
      { key: 'checklists.manage', label: 'Create & delete checklist templates', requiresPage: 'page.checklists' },
    ],
  },
  {
    key: 'reservations',
    label: 'Reservations & Waitlist',
    permissions: [
      { key: 'reservations.view', label: 'View reservations & the waitlist', requiresPage: 'page.reservations' },
      { key: 'reservations.manage', label: 'Book, seat, and cancel reservations', requiresPage: 'page.reservations' },
    ],
  },
  {
    key: 'reporting',
    label: 'Reporting',
    permissions: [
      { key: 'recipecosting.view', label: 'View recipe costing & menu engineering', requiresPage: 'page.recipecosting' },
      { key: 'audit.view', label: 'View the audit log', requiresPage: 'page.auditlog' },
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    permissions: [
      { key: 'expenses.view', label: 'View operating expenses', requiresPage: 'page.expenses' },
      { key: 'expenses.manage', label: 'Add, edit & delete operating expenses', requiresPage: 'page.expenses' },
    ],
  },
  {
    key: 'settings',
    label: 'Organization Settings',
    permissions: [
      { key: 'settings.staff', label: 'Manage staff & invitations', requiresPage: 'page.staff' },
      { key: 'settings.roles', label: 'Edit roles & permissions', requiresPage: 'page.staff' },
      { key: 'settings.restaurant', label: 'Restaurant & billing settings', requiresPage: 'page.settings' },
      { key: 'settings.headoffice', label: 'Head Office (multi-location)', requiresPage: 'page.headoffice' },
      { key: 'locations.manage', label: 'Add, edit & delete locations', requiresPage: 'page.locations' },
      // Deliberately separate from locations.manage — a role could be
      // trusted to rename/add locations without also being able to move
      // the attendance geofence, which affects every staff member's
      // ability to clock in at that location.
      { key: 'locations.geofence', label: 'Set attendance geofence (lat/long)', requiresPage: 'page.locations' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_SECTIONS.flatMap((s) => s.permissions.map((p) => p.key));

// Just the "Page Access" keys — used by the platform admin console's
// enabledPages toggle (a restaurant-wide entitlement layer, separate from
// but ANDed with these same per-role keys; see enabledPagesMigrationService.js).
export const PAGE_PERMISSION_KEYS = PERMISSION_SECTIONS.find((s) => s.key === 'pages').permissions.map((p) => p.key);

// Maps every permission key to the page.* key it lives "under" — a page.*
// key maps to itself; every finer key maps to whatever requiresPage says
// above (undefined if a key isn't tied to one specific page, e.g. none
// currently, but the shape allows it). requirePermission() uses this to
// enforce the restaurant's plan (enabledPages) even for finer keys like
// settings.headoffice — closing the gap where a role could be granted a
// finer permission for a plan-gated feature without the coarse page.* key
// ever being checked. Mirrors the same AND-gate Sidebar.tsx already applies
// client-side, but authoritative here.
export const PERMISSION_REQUIRED_PAGE = Object.fromEntries([
  ...PAGE_PERMISSION_KEYS.map((key) => [key, key]),
  ...PERMISSION_SECTIONS.flatMap((s) => s.permissions)
    .filter((p) => p.requiresPage)
    .map((p) => [p.key, p.requiresPage]),
]);

// Seeded into every new restaurant as its starting 4 non-Owner roles (Owner
// itself always gets every permission — see DEFAULT_ROLE_PERMISSIONS.Owner
// below — and is protected from being edited or deleted).
export const DEFAULT_ROLE_PERMISSIONS = {
  Owner: [...ALL_PERMISSIONS],
  Manager: [
    'page.dashboard', 'page.checklists',
    'page.pos', 'page.kitchen', 'page.inventory', 'page.orders', 'page.credits', 'page.customers',
    'page.reservations', 'page.recipecosting', 'page.scheduling', 'page.procurement', 'page.transfers', 'page.staff', 'page.expenses',
    'dash', 'tables', 'staff.view', 'customers',
    'orders.view', 'orders.edit', 'orders.checkout', 'orders.void', 'orders.discount', 'orders.tip', 'orders.credit', 'orders.refund',
    'menu.view', 'menu.edit', 'stock.view', 'stock.edit', 'stock.history',
    'credit.view', 'credit.settle',
    'procurement.view', 'procurement.manage', 'transfers.view', 'transfers.manage',
    'scheduling.view', 'scheduling.manage', 'checklists.manage', 'recipecosting.view',
    'reservations.view', 'reservations.manage',
    'settings.staff', 'expenses.view', 'expenses.manage',
  ],
  Cashier: [
    'page.dashboard', 'page.checklists',
    'page.pos', 'page.kitchen', 'page.inventory', 'page.orders', 'page.credits', 'page.customers',
    'page.reservations', 'page.scheduling', 'page.procurement', 'page.transfers',
    'tables', 'customers', 'orders.view', 'orders.checkout', 'orders.tip', 'orders.credit', 'menu.view', 'stock.view', 'credit.view', 'credit.settle',
    'procurement.view', 'transfers.view', 'scheduling.view', 'reservations.view', 'reservations.manage',
  ],
  Waiter: [
    'page.dashboard', 'page.checklists',
    'page.pos', 'page.kitchen', 'page.inventory', 'page.orders', 'page.credits', 'page.customers',
    'page.reservations', 'page.scheduling', 'page.procurement', 'page.transfers',
    'tables', 'customers', 'orders.view', 'orders.edit', 'orders.checkout', 'orders.tip', 'menu.view', 'stock.view', 'credit.view',
    'procurement.view', 'transfers.view', 'scheduling.view', 'reservations.view', 'reservations.manage',
  ],
  Kitchen: [
    'page.dashboard', 'page.checklists',
    'page.kitchen', 'page.inventory', 'page.orders', 'page.scheduling', 'page.procurement', 'page.transfers',
    'orders.view', 'menu.view', 'stock.view', 'stock.edit',
    'procurement.view', 'transfers.view', 'scheduling.view',
  ],
};

export const DEFAULT_ROLE_DESCRIPTIONS = {
  Owner: "Full access. Owners can see and change everything, including billing and other people's roles.",
  Manager: "Runs day-to-day operations at one location. Can't change billing or other locations' settings.",
  Cashier: "Takes payments and manages the credit ledger. Can't change menu prices or inventory.",
  Waiter: "Takes orders table-side. Can't discount, void, or see cost/finance data.",
  Kitchen: 'Sees incoming orders and manages raw ingredient stock. No access to payments or pricing.',
};

export const BUILT_IN_ROLE_NAMES = Object.keys(DEFAULT_ROLE_PERMISSIONS);
