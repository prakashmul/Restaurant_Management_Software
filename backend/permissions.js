// The full set of grantable permissions, grouped the same way the Roles &
// Permissions UI groups them. A role (built-in or custom) is just a name +
// a subset of this list.
export const PERMISSION_SECTIONS = [
  {
    // Coarse, page-level gate — a role without a page's key here never sees
    // it in the sidebar and can't reach it by URL either, regardless of
    // what finer per-action permissions (below) it's also been granted.
    // Dashboard and Checklists aren't listed: both stay visible to every
    // role no matter what (Dashboard hosts the shared shift clock;
    // Checklists' daily prep list is intentionally open to all staff — see
    // the comment on checklistsRoutes.js's GET /today route).
    key: 'pages',
    label: 'Page Access',
    permissions: [
      { key: 'page.pos', label: 'POS System' },
      { key: 'page.kitchen', label: 'Kitchen Display' },
      { key: 'page.inventory', label: 'Inventory' },
      { key: 'page.orders', label: 'Order History' },
      { key: 'page.credits', label: 'Credit Ledger' },
      { key: 'page.customers', label: 'Customers' },
      { key: 'page.reservations', label: 'Reservations' },
      { key: 'page.headoffice', label: 'Head Office' },
      { key: 'page.recipecosting', label: 'Recipe Costing' },
      { key: 'page.scheduling', label: 'Staff Schedule' },
      { key: 'page.procurement', label: 'Procurement' },
      { key: 'page.transfers', label: 'Transfers' },
      { key: 'page.staff', label: 'Users & Roles' },
      { key: 'page.locations', label: 'Locations' },
      { key: 'page.auditlog', label: 'Audit Log' },
      { key: 'page.settings', label: 'Settings' },
    ],
  },
  {
    key: 'general',
    label: 'General',
    permissions: [
      { key: 'dash', label: 'View Dashboard' },
      { key: 'tables', label: 'View & edit tables' },
      { key: 'staff.view', label: 'View staff list' },
      { key: 'customers', label: 'View & edit customers' },
    ],
  },
  {
    key: 'orders',
    label: 'Orders & Payment',
    permissions: [
      { key: 'orders.view', label: 'View orders' },
      { key: 'orders.edit', label: 'Create / edit orders' },
      { key: 'orders.checkout', label: 'Checkout & take payment' },
      { key: 'orders.void', label: 'Void / cancel an order' },
      { key: 'orders.discount', label: 'Apply discounts' },
      { key: 'orders.tip', label: 'Add / edit tips' },
      { key: 'orders.credit', label: 'Record on customer credit' },
      { key: 'orders.refund', label: 'Refund a paid, credited, or settled order' },
    ],
  },
  {
    key: 'menu',
    label: 'Menu & Inventory',
    permissions: [
      { key: 'menu.view', label: 'View menu & categories' },
      { key: 'menu.edit', label: 'Edit menu, prices & categories' },
      { key: 'stock.view', label: 'View stock levels' },
      { key: 'stock.edit', label: 'Restock / adjust inventory' },
      { key: 'stock.history', label: 'View stock movement history' },
    ],
  },
  {
    key: 'credit',
    label: 'Credit Ledger',
    permissions: [
      { key: 'credit.view', label: 'View credit ledger' },
      { key: 'credit.settle', label: 'Settle / write off balances' },
    ],
  },
  {
    key: 'procurement',
    label: 'Procurement & Transfers',
    permissions: [
      { key: 'procurement.view', label: 'View vendors & purchase orders' },
      { key: 'procurement.manage', label: 'Manage vendors & purchase orders' },
      { key: 'transfers.view', label: 'View inter-location transfers' },
      { key: 'transfers.manage', label: 'Send, receive & cancel transfers' },
    ],
  },
  {
    key: 'operations',
    label: 'Scheduling & Checklists',
    permissions: [
      { key: 'scheduling.view', label: 'View the staff schedule' },
      { key: 'scheduling.manage', label: 'Create shifts & view labor variance' },
      { key: 'checklists.manage', label: 'Create & delete checklist templates' },
    ],
  },
  {
    key: 'reservations',
    label: 'Reservations & Waitlist',
    permissions: [
      { key: 'reservations.view', label: 'View reservations & the waitlist' },
      { key: 'reservations.manage', label: 'Book, seat, and cancel reservations' },
    ],
  },
  {
    key: 'reporting',
    label: 'Reporting',
    permissions: [
      { key: 'recipecosting.view', label: 'View recipe costing & menu engineering' },
      { key: 'audit.view', label: 'View the audit log' },
    ],
  },
  {
    key: 'settings',
    label: 'Organization Settings',
    permissions: [
      { key: 'settings.staff', label: 'Manage staff & invitations' },
      { key: 'settings.roles', label: 'Edit roles & permissions' },
      { key: 'settings.restaurant', label: 'Restaurant & billing settings' },
      { key: 'settings.headoffice', label: 'Head Office (multi-location)' },
      { key: 'locations.manage', label: 'Add, edit & delete locations' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_SECTIONS.flatMap((s) => s.permissions.map((p) => p.key));

// Seeded into every new restaurant as its starting 4 non-Owner roles (Owner
// itself always gets every permission — see DEFAULT_ROLE_PERMISSIONS.Owner
// below — and is protected from being edited or deleted).
export const DEFAULT_ROLE_PERMISSIONS = {
  Owner: [...ALL_PERMISSIONS],
  Manager: [
    'page.pos', 'page.kitchen', 'page.inventory', 'page.orders', 'page.credits', 'page.customers',
    'page.reservations', 'page.recipecosting', 'page.scheduling', 'page.procurement', 'page.transfers', 'page.staff',
    'dash', 'tables', 'staff.view', 'customers',
    'orders.view', 'orders.edit', 'orders.checkout', 'orders.void', 'orders.discount', 'orders.tip', 'orders.credit', 'orders.refund',
    'menu.view', 'menu.edit', 'stock.view', 'stock.edit', 'stock.history',
    'credit.view', 'credit.settle',
    'procurement.view', 'procurement.manage', 'transfers.view', 'transfers.manage',
    'scheduling.view', 'scheduling.manage', 'checklists.manage', 'recipecosting.view',
    'reservations.view', 'reservations.manage',
    'settings.staff',
  ],
  Cashier: [
    'page.pos', 'page.kitchen', 'page.inventory', 'page.orders', 'page.credits', 'page.customers',
    'page.reservations', 'page.scheduling', 'page.procurement', 'page.transfers',
    'tables', 'customers', 'orders.view', 'orders.checkout', 'orders.tip', 'orders.credit', 'menu.view', 'stock.view', 'credit.view', 'credit.settle',
    'procurement.view', 'transfers.view', 'scheduling.view', 'reservations.view', 'reservations.manage',
  ],
  Waiter: [
    'page.pos', 'page.kitchen', 'page.inventory', 'page.orders', 'page.credits', 'page.customers',
    'page.reservations', 'page.scheduling', 'page.procurement', 'page.transfers',
    'tables', 'customers', 'orders.view', 'orders.edit', 'orders.checkout', 'orders.tip', 'menu.view', 'stock.view', 'credit.view',
    'procurement.view', 'transfers.view', 'scheduling.view', 'reservations.view', 'reservations.manage',
  ],
  Kitchen: [
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
