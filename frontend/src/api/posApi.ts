import axios from 'axios';
import type { MenuItem, Table, Order, InventoryItem, RecipeItem } from '../types';

const API = axios.create({ baseURL: 'http://localhost:5000/api' });

// Helper function to safely extract plain ID string
const cleanId = (idOrObj: any): string => {
  if (!idOrObj) return '';
  if (typeof idOrObj === 'string') return idOrObj;
  return String(idOrObj._id || idOrObj.id || '');
};

export interface CategoryItem {
  _id?: string;
  id?: string;
  name: string;
}

export interface CreditCustomer {
  id: string;
  name: string;
  phone: string;
  ordersCount: number;
  debtOwed: number;
  originalAmount: number;
  isFullySettled: boolean;
  notesHistory: string[];
  orderIds: string[];
}

export interface StockHistoryLog {
  _id?: string;
  id?: string;
  itemId?: string;
  itemName: string;
  quantity: number;
  unit: string;
  performedBy: string;
  description: string;
  createdAt: string;
}

export interface AttendanceRecordPayload {
  employeeName: string;
  checkInTime: string;
  checkOutTime: string | null;
  duration: string;
  status: 'Completed' | 'Auto-Checked Out' | 'Active';
}

export const posApi = {
  // Overview of all data in dashboard
  fetchOrders: async () => {
    const res = await fetch('http://localhost:5000/api/orders');
    if (!res.ok) throw new Error('Failed to fetch orders');
    return await res.json();
  },

  // Menu & Inventory
  getMenu: () => API.get<MenuItem[]>('/menu').then((r) => r.data),

  createMenuItem: (itemData: {
    name: string;
    category: string;
    price: number;
    recipe?: RecipeItem[];
  }) => API.post<MenuItem>('/menu', itemData).then((r) => r.data),

  deleteMenuItem: (id: any) => API.delete(`/menu/${cleanId(id)}`).then((r) => r.data),

  getCategories: () => API.get<CategoryItem[]>('/categories').then((r) => r.data),

  createCategory: (categoryName: string) =>
    API.post<CategoryItem>('/categories', { name: categoryName }).then((r) => r.data),

  deleteCategory: (idOrName: any) =>
    API.delete(`/categories/${cleanId(idOrName) || idOrName}`).then((r) => r.data),

  getInventory: () => API.get<InventoryItem[]>('/inventory').then((r) => r.data),

  // Create New Inventory Item & History Log
  createInventoryItem: (itemData: {
    name: string;
    totalQuantity: number;
    unit: string;
    costPerUnit: number;
    performedBy: string;
    description: string;
  }) => API.post<InventoryItem>('/inventory', itemData).then((r) => r.data),

  // Tables
  getTables: () => API.get<Table[]>('/tables').then((r) => r.data),

  createTable: (number: number, seats: number) =>
    API.post<Table>('/tables', { number, seats }).then((r) => r.data),

  updateTable: (id: any, data: Partial<Table>) =>
    API.put<Table>(`/tables/${cleanId(id)}`, data).then((r) => r.data),

  deleteTable: (id: any) => API.delete(`/tables/${cleanId(id)}`).then((r) => r.data),

  cancelTableOrder: (tableId: any) =>
    API.delete(`/orders/table/${cleanId(tableId)}`).then((r) => r.data),

  // Orders (Fixed Object ID Serialization & Sanitization)
  getOrders: () => API.get<Order[]>('/orders').then((r) => r.data),

  saveOrder: (
    tableId: any,
    items: { menuItemId: any; name: string; price: number; quantity: number }[]
  ) => {
    // Sanitize table ID and item array before sending to Express/MongoDB
    const safeTableId = cleanId(tableId);
    const safeItems = (items || []).map((item) => ({
      menuItemId: cleanId(item.menuItemId),
      name: item.name,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 1,
    }));

    return API.post<Order>('/orders/save', {
      tableId: safeTableId,
      items: safeItems,
    }).then((r) => r.data);
  },

  payOrder: (orderId: any, paymentMethod: string = 'cash') =>
    API.post<{ message: string; order: Order; inventory: InventoryItem[] }>(
      `/orders/${cleanId(orderId)}/pay`,
      { paymentMethod }
    ).then((r) => r.data),

  deleteOrder: (orderId: any) => API.delete(`/orders/${cleanId(orderId)}`).then((r) => r.data),

  // Credit Ledger Integration
  processFullCredit: (orderId: any, customerName: string, customerPhone: string) =>
    API.post(`/orders/${cleanId(orderId)}/credit`, { customerName, customerPhone }).then((r) => r.data),

  getCreditLedger: () => API.get<CreditCustomer[]>('/credits').then((r) => r.data),

  partialCreditPayment: (customerPhone: string, customerName: string, amount: number, note: string) =>
    API.post('/orders/credit/partial-pay', { customerPhone, customerName, amount, note }).then(
      (r) => r.data
    ),

  fullSettleCredit: (customerPhone: string, customerName: string) =>
    API.post('/orders/credit/full-settle', { customerPhone, customerName }).then((r) => r.data),

  // Inventory Restock & Adjustments
  restockItem: (
    id: any,
    quantity: number,
    meta?: { performedBy?: string; description?: string }
  ) =>
    API.patch<InventoryItem>(`/inventory/${cleanId(id)}/restock`, {
      quantity,
      performedBy: meta?.performedBy,
      description: meta?.description,
    }).then((r) => r.data),

  // Inventory History
  getStockHistory: () => API.get<StockHistoryLog[]>('/inventory/history').then((r) => r.data),

  // Attendance API Calls
  fetchAttendanceHistory: async () => {
    try {
      const response = await API.get('/attendance');
      return response.data;
    } catch (error) {
      console.error('Error fetching attendance history:', error);
      throw error;
    }
  },

  saveAttendanceRecord: async (payload: {
    employeeName: string;
    checkInTime: string;
    checkOutTime: string | null;
    duration: string;
    status: string;
  }) => {
    try {
      const response = await API.post('/attendance', payload);
      return response.data;
    } catch (error) {
      console.error('Error saving attendance record:', error);
      throw error;
    }
  },
};