export interface InventoryItem {
  id?: string;
  _id?: string;
  name: string;
  totalQuantity: number;
  unit: 'kg' | 'g' | 'liters' | 'units';
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
  category: 'Mains' | 'Starters' | 'Beverages' | 'Desserts' | string;
  price: number;
  recipe?: RecipeItem[] | RecipeItem;
}

export interface Table {
  id?: string;
  _id?: string;
  number: number;
  status: 'available' | 'occupied' | 'reserved' | 'free';
  seats: number;
}

export interface OrderItem {
  menuItemId: string;
  _id?: string;
  name: string;
  price: number;
  quantity: number;
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