export interface InventoryItem {
  id?: string;
  _id?: string;
  name: string;
  totalQuantity: number;
  unit: 'kg' | 'g' | 'liters' | 'units' | string;
  costPerUnit: number;
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
}

export interface Order {
  id?: string;
  _id?: string;
  tableId: string;
  items: OrderItem[];
  status: 'pending' | 'paid' | 'completed' | 'cancelled' | 'unsettled' | 'settled';
  subtotal?: number;
  tax?: number;
  total?: number;
  totalAmount?: number;
  paymentMethod?: 'cash' | 'fonepay' | 'split' | 'credit' | string;
  customerName?: string;
  customerPhone?: string;
  createdAt?: string;
  paidAt?: string;
}

export type Product = MenuItem;
export type CartItem = OrderItem;