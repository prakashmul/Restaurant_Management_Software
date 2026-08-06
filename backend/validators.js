import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('A valid email is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  restaurantName: z.string().trim().min(1, 'Restaurant name is required.'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('A valid email is required.'),
  password: z.string().min(1, 'Password is required.'),
});

const ROLE_ENUM = ['Owner', 'Manager', 'Cashier', 'Waiter', 'Kitchen'];

export const staffInviteSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('A valid email is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.enum(ROLE_ENUM),
  // Omit or null = unrestricted (sees every location); set = confined to one.
  locationId: z.string().trim().min(1).nullable().optional(),
});

export const staffRoleUpdateSchema = z.object({
  role: z.enum(ROLE_ENUM),
  locationId: z.string().trim().min(1).nullable().optional(),
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
  performedBy: z.string().trim().optional(),
  description: z.string().trim().optional(),
});

export const restockSchema = z
  .object({
    quantity: z.coerce.number().optional(),
    addQuantity: z.coerce.number().optional(),
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

export const fullSettleSchema = z.object({
  customerPhone: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
});

export const createLocationSchema = z.object({
  name: z.string().trim().min(1, 'Location name is required.'),
  address: z.string().trim().optional().default(''),
  phone: z.string().trim().optional().default(''),
});

export const updateLocationSchema = z.object({
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
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

export const attendanceSchema = z.object({
  employeeName: z.string().trim().min(1, 'Employee name is required.'),
  checkInTime: z.string().trim().min(1, 'Check-in time is required.'),
  checkOutTime: z.string().trim().nullable().optional(),
  duration: z.string().trim().optional().default('00:00:00'),
  status: z.enum(['Completed', 'Auto-Checked Out', 'Active']).optional().default('Active'),
});
