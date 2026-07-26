import axios from 'axios';
import type { MenuItem, Table, Order, InventoryItem } from '../types';

const API = axios.create({ baseURL: 'http://localhost:5000/api' });

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
  // Menu & Inventory
  getMenu: () => API.get<MenuItem[]>('/menu').then((r) => r.data),
  getInventory: () => API.get<InventoryItem[]>('/inventory').then((r) => r.data),

  // Tables
  getTables: () => API.get<Table[]>('/tables').then((r) => r.data),
  createTable: (number: number, seats: number) => API.post<Table>('/tables', { number, seats }).then((r) => r.data),
  updateTable: (id: string, data: Partial<Table>) => API.put<Table>(`/tables/${id}`, data).then((r) => r.data),
  deleteTable: (id: string) => API.delete(`/tables/${id}`).then((r) => r.data),
  cancelTableOrder: (tableId: string) => API.delete(`/orders/table/${tableId}`).then((r) => r.data),

  // Orders
  getOrders: () => API.get<Order[]>('/orders').then((r) => r.data),
  saveOrder: (tableId: string, items: { menuItemId: string; name: string; price: number; quantity: number }[]) =>
    API.post<Order>('/orders/save', { tableId, items }).then((r) => r.data),
  payOrder: (orderId: string, paymentMethod: string = 'cash') =>
    API.post<{ message: string; inventory: InventoryItem[] }>(`/orders/${orderId}/pay`, { paymentMethod }).then((r) => r.data),
  deleteOrder: (orderId: string) => API.delete(`/orders/${orderId}`).then((r) => r.data),

  // Credit Ledger Integration
  processFullCredit: (orderId: string, customerName: string, customerPhone: string) =>
    API.post(`/orders/${orderId}/credit`, { customerName, customerPhone }).then((r) => r.data),

  getCreditLedger: () =>
    API.get<CreditCustomer[]>('/credits').then((r) => r.data),

  partialCreditPayment: (customerPhone: string, customerName: string, amount: number, note: string) =>
    API.post('/orders/credit/partial-pay', { customerPhone, customerName, amount, note }).then((r) => r.data),

  fullSettleCredit: (customerPhone: string, customerName: string) =>
    API.post('/orders/credit/full-settle', { customerPhone, customerName }).then((r) => r.data),

  // Inventory Restock & Adjustments
  restockItem: (
    id: string,
    quantity: number,
    meta?: { performedBy?: string; description?: string }
  ) =>
    API.patch<InventoryItem>(`/inventory/${id}/restock`, {
      quantity,
      performedBy: meta?.performedBy,
      description: meta?.description,
    }).then((r) => r.data),

  // Inventory History
  getStockHistory: () =>
    API.get<StockHistoryLog[]>('/inventory/history').then((r) => r.data),


// --- ATTENDANCE API CALLS ---

// Fetch Attendance logs from MongoDB
fetchAttendanceHistory: async () => {
  try {
    const response = await API.get('/attendance');
    return response.data;
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    throw error;
  }
},

// Save Attendance log to MongoDB
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