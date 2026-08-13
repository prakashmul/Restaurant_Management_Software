import { z } from 'zod';
import { ALL_PERMISSIONS } from './permissions.js';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('A valid email is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  restaurantName: z.string().trim().min(1, 'Restaurant name is required.'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('A valid email is required.'),
  password: z.string().min(1, 'Password is required.'),
  // Only required once the account has TOTP enabled — see authController.js login().
  totpToken: z.string().trim().min(1).optional(),
});

export const totpTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('A valid email is required.'),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

// No password field — a new staff member gets one via an emailed set-password
// link (see staffController.js inviteStaff), never typed by the inviter.
export const staffInviteSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('A valid email is required.'),
  roleId: z.string().trim().min(1, 'A role is required.'),
  // Omit or null = unrestricted (sees every location); set = confined to one.
  locationId: z.string().trim().min(1).nullable().optional(),
});

export const staffRoleUpdateSchema = z.object({
  roleId: z.string().trim().min(1, 'A role is required.'),
  locationId: z.string().trim().min(1).nullable().optional(),
});

export const staffRateUpdateSchema = z.object({
  hourlyRate: z.coerce.number().min(0, 'Hourly rate cannot be negative.'),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, 'Role name is required.').max(40),
  description: z.string().trim().max(200).optional().default(''),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required.'),
});

const recipeItemSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantityPerPortion: z.coerce.number().positive('Ingredient quantity must be greater than 0.'),
});

export const menuItemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  category: z.string().trim().min(1, 'Category is required.'),
  price: z.coerce.number().nonnegative('Price cannot be negative.'),
  sku: z.string().trim().optional(),
  recipe: z.array(recipeItemSchema).optional().default([]),
});

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  totalQuantity: z.coerce.number().min(0, 'Initial stock cannot be negative.'),
  unit: z.string().trim().min(1, 'Unit is required.'),
  costPerUnit: z.coerce.number().min(0).optional().default(0),
  lowStockThreshold: z.coerce.number().min(0).optional().default(0),
  performedBy: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export const updateInventoryItemSchema = z.object({
  name: z.string().trim().min(1).optional(),
  unit: z.string().trim().min(1).optional(),
  costPerUnit: z.coerce.number().min(0).optional(),
  lowStockThreshold: z.coerce.number().min(0).optional(),
  preferredVendorId: z.string().trim().nullable().optional(),
  reorderQuantity: z.coerce.number().min(0).optional(),
  barcode: z.string().trim().nullable().optional(),
});

export const restockSchema = z
  .object({
    quantity: z.coerce.number().optional(),
    addQuantity: z.coerce.number().optional(),
    // Optional — a priced restock (an actual purchase) recomputes this
    // location's weighted-average cost; omitted means "just adjusting the
    // count," e.g. a stock-take correction, and leaves cost untouched.
    unitCost: z.coerce.number().min(0).optional(),
    performedBy: z.string().trim().optional(),
    description: z.string().trim().optional(),
  })
  .refine(
    (data) => {
      const qty = data.quantity !== undefined ? data.quantity : data.addQuantity;
      return qty !== undefined && !Number.isNaN(qty) && qty !== 0;
    },
    { message: 'Invalid quantity value' }
  );

export const logWasteSchema = z.object({
  quantity: z.coerce.number().positive('Enter the amount wasted, greater than 0.'),
  wasteReason: z.enum(['spoilage', 'breakage', 'staff-meal', 'other']),
  performedBy: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export const createTableSchema = z.object({
  number: z.coerce.number().int('Table number must be a whole number.'),
  seats: z.coerce.number().int().positive().optional().default(4),
});

export const updateTableSchema = z.object({
  number: z.coerce.number().int().optional(),
  seats: z.coerce.number().int().positive().optional(),
  status: z.enum(['available', 'occupied']).optional(),
});

const orderItemInputSchema = z.object({
  menuItemId: z.union([z.string(), z.number()]),
  id: z.union([z.string(), z.number()]).optional(),
  _id: z.union([z.string(), z.number()]).optional(),
  name: z.string().optional(),
  price: z.coerce.number().optional(),
  quantity: z.coerce.number().optional(),
  bumped: z.boolean().optional(),
});

export const saveOrderSchema = z.object({
  tableId: z.union([z.string(), z.number()]),
  items: z.array(orderItemInputSchema).optional().default([]),
});

export const payOrderSchema = z.object({
  paymentMethod: z.string().trim().optional().default('cash'),
});

export const creditOrderSchema = z.object({
  customerName: z.string().trim().optional(),
  customerPhone: z.string().trim().optional(),
});

export const partialCreditPaySchema = z.object({
  customerPhone: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  amount: z.coerce.number().positive('Payment amount must be greater than 0.'),
  note: z.string().trim().optional(),
});

export const applyDiscountSchema = z
  .object({
    type: z.enum(['percent', 'flat']).nullable(),
    value: z.coerce.number().min(0).optional().default(0),
    reason: z.string().trim().max(200).optional().default(''),
  })
  .refine((data) => data.type !== 'percent' || data.value <= 100, {
    message: 'A percentage discount cannot exceed 100%.',
    path: ['value'],
  });

export const refundOrderSchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required to refund an order.').max(300),
  // Omitted means "refund whatever is still refundable" (a full refund, or
  // whatever remains after earlier partial refunds) — see refundOrder in
  // ordersController.js.
  amount: z.coerce.number().positive().optional(),
});

export const applyTipSchema = z
  .object({
    type: z.enum(['percent', 'flat']).nullable(),
    value: z.coerce.number().min(0).optional().default(0),
  })
  .refine((data) => data.type !== 'percent' || data.value <= 100, {
    message: 'A percentage tip cannot exceed 100%.',
    path: ['value'],
  });

export const fullSettleSchema = z.object({
  customerPhone: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
});

export const updateRestaurantSchema = z.object({
  name: z.string().trim().min(1, 'Restaurant name is required.').optional(),
  logoUrl: z.string().trim().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  taxRatePercent: z.coerce.number().min(0).max(100).optional(),
  loyaltyEarnRatePerRs: z.coerce.number().min(0).optional(),
  loyaltyPointValueRs: z.coerce.number().min(0).optional(),
});

export const attachOrderCustomerSchema = z.object({
  customerPhone: z.string().trim().min(1, 'A phone number is required to attach a customer.'),
  customerName: z.string().trim().optional(),
});

export const redeemPointsSchema = z.object({
  points: z.coerce.number().int().positive('Enter a positive number of points to redeem.'),
});

export const switchTableSchema = z.object({
  destinationTableId: z.string().trim().min(1, 'Select a destination table.'),
});

export const createReservationSchema = z.object({
  customerName: z.string().trim().min(1, 'A name is required.'),
  customerPhone: z.string().trim().optional(),
  partySize: z.coerce.number().int().positive('Party size must be at least 1.'),
  reservationTime: z.coerce.date({ errorMap: () => ({ message: 'A valid reservation date/time is required.' }) }),
  notes: z.string().trim().max(500).optional(),
});

export const addToWaitlistSchema = z.object({
  customerName: z.string().trim().min(1, 'A name is required.'),
  customerPhone: z.string().trim().optional(),
  partySize: z.coerce.number().int().positive('Party size must be at least 1.'),
  notes: z.string().trim().max(500).optional(),
});

export const updateReservationStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'seated', 'cancelled', 'no-show']),
  tableId: z.string().trim().optional(),
});

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, 'Location name is required.'),
  address: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
  currency: z.string().trim().min(1).max(10).optional(),
});

export const updateLocationSchema = z.object({
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  geofence: z
    .object({
      latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
      longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
      radiusMeters: z.coerce.number().positive().optional(),
    })
    .optional(),
});

export const createVendorSchema = z.object({
  name: z.string().trim().min(1, 'Vendor name is required.'),
  category: z.string().trim().min(1, 'Category is required.'),
  contactPhone: z.string().trim().optional().default(''),
  contactEmail: z.string().trim().optional().default(''),
});

const purchaseOrderItemSchema = z.object({
  inventoryItemId: z.string().trim().min(1, 'Inventory item is required.'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0.'),
  unitCost: z.coerce.number().min(0, 'Unit cost cannot be negative.'),
});

export const createPurchaseOrderSchema = z.object({
  vendorId: z.string().trim().min(1, 'Vendor is required.'),
  items: z.array(purchaseOrderItemSchema).min(1, 'At least one line item is required.'),
});

export const updatePurchaseOrderStatusSchema = z.object({
  status: z.enum(['sent', 'received', 'reconciled']),
});

const transferItemSchema = z.object({
  inventoryItemId: z.string().trim().min(1, 'Inventory item is required.'),
  quantity: z.coerce.number().positive('Quantity must be greater than 0.'),
});

export const createTransferSchema = z.object({
  toLocationId: z.string().trim().min(1, 'Destination location is required.'),
  items: z.array(transferItemSchema).min(1, 'At least one line item is required.'),
});

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const createShiftSchema = z
  .object({
    staffMembershipId: z.string().trim().min(1, 'Staff member is required.'),
    date: z.string().regex(DATE_PATTERN, 'Date must be in YYYY-MM-DD format.'),
    startTime: z.string().regex(TIME_PATTERN, 'Start time must be in HH:MM format.'),
    endTime: z.string().regex(TIME_PATTERN, 'End time must be in HH:MM format.'),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: 'End time must be after start time (overnight shifts are not supported yet).',
    path: ['endTime'],
  });

export const checklistTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Checklist name is required.'),
  items: z.array(z.string().trim().min(1)).min(1, 'At least one checklist item is required.'),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').optional(),
  phone: z.string().trim().optional(),
});

export const attendanceSchema = z.object({
  employeeName: z.string().trim().min(1, 'Employee name is required.'),
  checkInTime: z.string().trim().min(1, 'Check-in time is required.'),
  checkOutTime: z.string().trim().nullable().optional(),
  duration: z.string().trim().optional().default('00:00:00'),
  status: z.enum(['Completed', 'Auto-Checked Out', 'Active']).optional().default('Active'),
});

const EXPENSE_CATEGORIES = ['staff_salary', 'rent', 'electricity', 'water', 'miscellaneous', 'other'];

export const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { errorMap: () => ({ message: 'Select a valid expense category.' }) }),
  amount: z.coerce.number().positive('Amount must be greater than 0.'),
  date: z.string().regex(DATE_PATTERN, 'Date must be in YYYY-MM-DD format.'),
  note: z.string().trim().optional(),
});

export const updateExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  amount: z.coerce.number().positive('Amount must be greater than 0.').optional(),
  date: z.string().regex(DATE_PATTERN, 'Date must be in YYYY-MM-DD format.').optional(),
  note: z.string().trim().optional(),
});
