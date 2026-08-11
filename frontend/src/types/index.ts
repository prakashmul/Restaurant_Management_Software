export interface InventoryItem {
  id?: string;
  _id?: string;
  name: string;
  totalQuantity: number;
  unit: 'kg' | 'g' | 'liters' | 'units' | string;
  costPerUnit: number;
  lowStockThreshold?: number;
  isLowStock?: boolean;
  preferredVendorId?: string | null;
  reorderQuantity?: number;
  barcode?: string | null;
}

export interface RecipeItem {
  inventoryItemId: string;
  quantityPerPortion: number;
}

export interface MenuItem {
  id?: string;
  _id?: string;
  sku?: string;
  name: string;
  category: string;
  price: number;
  recipe?: RecipeItem[];
}

export interface Table {
  id?: string;
  _id?: string;
  number: number;
  status: 'available' | 'occupied';
  seats: number;
}

export interface OrderItem {
  menuItemId: string;
  _id?: string;
  name: string;
  price: number;
  quantity: number;
  recipe?: RecipeItem[];
  bumped?: boolean;
}

export interface Order {
  id?: string;
  _id?: string;
  tableId: string;
  items: OrderItem[];
  status: 'pending' | 'paid' | 'completed' | 'cancelled' | 'credit' | 'unsettled' | 'settled' | 'refunded';
  subtotal?: number;
  remainingBalance?: number;
  paymentHistory?: { amount: number; note?: string; type: 'partial' | 'full'; createdAt: string }[];
  refundHistory?: { amount: number; reason: string; refundedBy: string; createdAt: string }[];
  refundedAt?: string;
  discount?: {
    type: 'percent' | 'flat' | null;
    value: number;
    reason: string;
    amount: number;
  };
  tip?: {
    type: 'percent' | 'flat' | null;
    value: number;
    amount: number;
  };
  tax?: number;
  total?: number;
  totalAmount?: number;
  paymentMethod?: 'cash' | 'fonepay' | 'split' | 'credit' | string;
  customerId?: string | null;
  customerName?: string;
  customerPhone?: string;
  createdAt?: string;
  paidAt?: string;
}

export type Product = MenuItem;
export type CartItem = OrderItem;