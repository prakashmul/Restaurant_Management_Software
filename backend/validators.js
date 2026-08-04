import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  email: z.string().trim().email('A valid email is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('A valid email is required.'),
  password: z.string().min(1, 'Password is required.'),
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

export const attendanceSchema = z.object({
  employeeName: z.string().trim().min(1, 'Employee name is required.'),
  checkInTime: z.string().trim().min(1, 'Check-in time is required.'),
  checkOutTime: z.string().trim().nullable().optional(),
  duration: z.string().trim().optional().default('00:00:00'),
  status: z.enum(['Completed', 'Auto-Checked Out', 'Active']).optional().default('Active'),
});
