import axios from 'axios';
import type { MenuItem, Table, Order, InventoryItem, RecipeItem } from '../types';

export const API_ROOT = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
export const API_BASE_URL = `${API_ROOT}/api`;

const API = axios.create({ baseURL: API_BASE_URL });

// Attach the signed-in user's JWT, and the currently-selected location (if
// any), to every request. A location-restricted staff member's header is
// ignored server-side in favor of their assigned location — this is just
// what an unrestricted Owner/Manager is currently looking at.
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  const savedLocation = localStorage.getItem('currentLocation');
  if (savedLocation) {
    try {
      const locationId = JSON.parse(savedLocation)?.id;
      if (locationId) {
        config.headers = config.headers || {};
        config.headers['X-Location-Id'] = locationId;
      }
    } catch {
      // ignore malformed localStorage value
    }
  }
  return config;
});

// A 401 means the token is missing/expired — clear the stale session and
// send the user back to the login screen instead of failing silently.
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

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

export type MenuEngineeringClass = 'star' | 'puzzle' | 'plow-horse' | 'dog' | null;

export interface CostedDish {
  id: string;
  name: string;
  category: string;
  price: number;
  ingredientCost: number | null;
  foodCostPercent: number | null;
  margin: number | null;
  unitsSold: number;
  revenue: number;
  classification: MenuEngineeringClass;
}

export interface WasteLogEntry {
  id: string;
  itemName: string;
  quantity: number;
  unit: string;
  reason: string;
  performedBy: string;
  createdAt: string;
}

export interface MenuEngineeringReport {
  periodDays: number;
  medianUnitsSold: number;
  medianMargin: number;
  dishesAnalyzed: number;
  dishesMissingCostData: number;
  dishes: CostedDish[];
  wasteLog: WasteLogEntry[];
}

export interface AuditLogEntry {
  _id: string;
  actorName: string;
  actorEmail: string;
  action: string;
  createdAt: string;
}

export interface Location {
  _id: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  geofence: {
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
  };
}

export interface HeadOfficeLocationSummary {
  id: string;
  name: string;
  address: string;
  isActive: boolean;
  todaySales: number;
  sales7d: number;
  salesTrendPercent: number | null;
  dailySales: { date: string; total: number }[];
  foodCostPercent: number | null;
  foodCostStatus: 'good' | 'watch' | 'bad' | 'unknown';
  laborHours7d: number;
  creditExposure: number;
}

export interface HeadOfficeSummary {
  locations: HeadOfficeLocationSummary[];
}

export interface Vendor {
  _id: string;
  name: string;
  category: string;
  contactPhone: string;
  contactEmail: string;
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'received' | 'reconciled';

export interface PurchaseOrderItem {
  inventoryItemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrder {
  _id: string;
  vendorId: string;
  vendorName: string;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
  totalAmount: number;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  reconciledAt: string | null;
}

export type TransferStatus = 'in_transit' | 'received' | 'cancelled';

export interface TransferItem {
  inventoryItemId: string;
  itemName: string;
  unit: string;
  quantity: number;
}

export interface Transfer {
  _id: string;
  fromLocationId: string;
  toLocationId: string;
  fromLocationName: string;
  toLocationName: string;
  items: TransferItem[];
  status: TransferStatus;
  requestedBy: string;
  createdAt: string;
  receivedAt: string | null;
  cancelledAt: string | null;
}

export interface Shift {
  _id: string;
  staffMembershipId: string;
  staffName: string;
  role: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleVariance {
  start: string;
  end: string;
  totalPlannedSeconds: number;
  totalActualSeconds: number;
  variancePercent: number | null;
  perStaff: { name: string; plannedSeconds: number; actualSeconds: number }[];
}

export interface ChecklistTemplate {
  _id: string;
  name: string;
  items: { text: string }[];
}

export interface ChecklistItem {
  index: number;
  text: string;
  done: boolean;
  completedBy: string;
  completedAt: string | null;
}

export interface ChecklistCompletion {
  completionId: string;
  templateId: string;
  templateName: string;
  date: string;
  items: ChecklistItem[];
  completedCount: number;
  totalCount: number;
}

export type StaffRole = 'Owner' | 'Manager' | 'Cashier' | 'Waiter' | 'Kitchen';

export interface StaffMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: StaffRole;
  status: 'active' | 'invited';
  joinedAt: string;
}

export const posApi = {
  // Overview of all data in dashboard
  fetchOrders: async () => {
    const res = await API.get('/orders');
    return res.data;
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

  // Idempotency-Key is derived from the orderId itself: paying a given order
  // is one logical operation no matter how many times a dropped connection
  // makes the client retry it, so the key must stay stable across retries.
  payOrder: (orderId: any, paymentMethod: string = 'cash') => {
    const id = cleanId(orderId);
    return API.post<{ message: string; order: Order; inventory: InventoryItem[] }>(
      `/orders/${id}/pay`,
      { paymentMethod },
      { headers: { 'Idempotency-Key': `pay:${id}` } }
    ).then((r) => r.data);
  },

  deleteOrder: (orderId: any) => API.delete(`/orders/${cleanId(orderId)}`).then((r) => r.data),

  // Credit Ledger Integration
  processFullCredit: (orderId: any, customerName: string, customerPhone: string) => {
    const id = cleanId(orderId);
    return API.post(
      `/orders/${id}/credit`,
      { customerName, customerPhone },
      { headers: { 'Idempotency-Key': `credit:${id}` } }
    ).then((r) => r.data);
  },

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

  // Staff & Roles
  getStaff: () => API.get<StaffMember[]>('/staff').then((r) => r.data),

  inviteStaff: (data: { name: string; email: string; password: string; role: StaffRole }) =>
    API.post<StaffMember>('/staff/invite', data).then((r) => r.data),

  updateStaffRole: (staffId: string, role: StaffRole) =>
    API.patch<StaffMember>(`/staff/${staffId}/role`, { role }).then((r) => r.data),

  removeStaff: (staffId: string) => API.delete(`/staff/${staffId}`).then((r) => r.data),

  // Recipe Costing & Menu Engineering
  getMenuEngineering: (days: number = 30) =>
    API.get<MenuEngineeringReport>('/recipe-costing', { params: { days } }).then((r) => r.data),

  // Checklists
  getChecklistTemplates: () => API.get<ChecklistTemplate[]>('/checklists/templates').then((r) => r.data),

  createChecklistTemplate: (data: { name: string; items: string[] }) =>
    API.post<ChecklistTemplate>('/checklists/templates', data).then((r) => r.data),

  deleteChecklistTemplate: (id: string) => API.delete(`/checklists/templates/${id}`).then((r) => r.data),

  getTodayChecklists: () => API.get<ChecklistCompletion[]>('/checklists/today').then((r) => r.data),

  toggleChecklistItem: (completionId: string, itemIndex: number) =>
    API.patch<ChecklistCompletion>(`/checklists/completions/${completionId}/items/${itemIndex}/toggle`).then(
      (r) => r.data
    ),

  // Staff Scheduling
  getShifts: (start: string, end: string) =>
    API.get<Shift[]>('/scheduling/shifts', { params: { start, end } }).then((r) => r.data),

  createShift: (data: { staffMembershipId: string; date: string; startTime: string; endTime: string }) =>
    API.post<Shift>('/scheduling/shifts', data).then((r) => r.data),

  deleteShift: (id: string) => API.delete(`/scheduling/shifts/${id}`).then((r) => r.data),

  getScheduleVariance: (start: string, end: string) =>
    API.get<ScheduleVariance>('/scheduling/variance', { params: { start, end } }).then((r) => r.data),

  // Procurement & Vendors
  getVendors: () => API.get<Vendor[]>('/procurement/vendors').then((r) => r.data),

  createVendor: (data: { name: string; category: string; contactPhone?: string; contactEmail?: string }) =>
    API.post<Vendor>('/procurement/vendors', data).then((r) => r.data),

  deleteVendor: (id: string) => API.delete(`/procurement/vendors/${id}`).then((r) => r.data),

  getPurchaseOrders: (status?: PurchaseOrderStatus) =>
    API.get<PurchaseOrder[]>('/procurement/purchase-orders', { params: status ? { status } : {} }).then(
      (r) => r.data
    ),

  createPurchaseOrder: (data: {
    vendorId: string;
    items: { inventoryItemId: string; quantity: number; unitCost: number }[];
  }) => API.post<PurchaseOrder>('/procurement/purchase-orders', data).then((r) => r.data),

  updatePurchaseOrderStatus: (id: string, status: PurchaseOrderStatus) =>
    API.patch<PurchaseOrder>(`/procurement/purchase-orders/${id}/status`, { status }).then((r) => r.data),

  deletePurchaseOrder: (id: string) => API.delete(`/procurement/purchase-orders/${id}`).then((r) => r.data),

  // Audit Log
  getAuditLog: (limit: number = 50) =>
    API.get<AuditLogEntry[]>('/audit-log', { params: { limit } }).then((r) => r.data),

  // Locations
  getLocations: () => API.get<Location[]>('/locations').then((r) => r.data),

  createLocation: (data: { name: string; address?: string; phone?: string }) =>
    API.post<Location>('/locations', data).then((r) => r.data),

  updateLocation: (id: string, data: Partial<Pick<Location, 'name' | 'address' | 'phone' | 'isActive'>>) =>
    API.patch<Location>(`/locations/${id}`, data).then((r) => r.data),

  deleteLocation: (id: string) => API.delete(`/locations/${id}`).then((r) => r.data),

  // Head Office
  getHeadOfficeSummary: () => API.get<HeadOfficeSummary>('/head-office/summary').then((r) => r.data),

  // Inter-Location Transfers
  getTransfers: (status?: TransferStatus) =>
    API.get<Transfer[]>('/transfers', { params: status ? { status } : {} }).then((r) => r.data),

  createTransfer: (data: { toLocationId: string; items: { inventoryItemId: string; quantity: number }[] }) =>
    API.post<Transfer>('/transfers', data).then((r) => r.data),

  receiveTransfer: (id: string) => API.patch<Transfer>(`/transfers/${id}/receive`).then((r) => r.data),

  cancelTransfer: (id: string) => API.patch<Transfer>(`/transfers/${id}/cancel`).then((r) => r.data),
};