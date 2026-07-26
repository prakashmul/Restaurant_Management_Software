import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Calendar,
  Filter,
  Printer,
  FileDown,
  Trash2,
  Receipt,
  ChevronDown,
  ChevronUp,
  CreditCard,
  User,
} from 'lucide-react';
import { posApi } from '../api/posApi';
import type { Order } from '../types';

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Helper to convert any Date or ISO string into local YYYY-MM-DD
  const formatLocalYYYYMMDD = (dateInput?: string | Date) => {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTodayStr = () => formatLocalYYYYMMDD(new Date());

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'custom' | 'all'>('today');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Expandable Row State for Order Details
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await posApi.getOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load order history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Filter & Sort Logic
  const filteredOrders = useMemo(() => {
    // 1. Filter orders based on search, status, and date criteria
    const filtered = orders.filter((order) => {
      const orderId = order._id || order.id || '';
      const customerName = (order as any).customerName || '';
      const customerPhone = (order as any).customerPhone || '';

      // Search Filter (ID, Customer Name, or Phone)
      const matchesSearch =
        !searchQuery ||
        orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customerPhone.includes(searchQuery);

      // Status Filter
      const status = (order.status || 'pending').toLowerCase();
      const method = ((order as any).paymentMethod || '').toLowerCase();

      let matchesStatus = true;
      if (statusFilter === 'paid') {
        matchesStatus = status === 'paid' && method !== 'credit';
      } else if (statusFilter === 'settled') {
        matchesStatus = status === 'settled';
      } else if (statusFilter === 'unsettled') {
        matchesStatus = status === 'credit' || status === 'unsettled' || status === 'pending';
      }

      // Date Filter
      let matchesDate = true;
      const orderLocalDate = formatLocalYYYYMMDD(order.createdAt);

      if (dateFilter === 'today') {
        matchesDate = orderLocalDate === getTodayStr();
      } else if (dateFilter === 'yesterday') {
        const yday = new Date();
        yday.setDate(yday.getDate() - 1);
        const ydayStr = formatLocalYYYYMMDD(yday);
        matchesDate = orderLocalDate === ydayStr;
      } else if (dateFilter === 'custom' && selectedDate) {
        matchesDate = orderLocalDate === selectedDate;
      } else if (dateFilter === 'all') {
        matchesDate = true;
      }

      return matchesSearch && matchesStatus && matchesDate;
    });

    // Helper to safely extract a numeric timestamp
    const getOrderTimestamp = (ord: Order): number => {
      if (ord.createdAt) {
        const t = new Date(ord.createdAt).getTime();
        if (!isNaN(t)) return t;
      }
      // Fallback: Extract timestamp from MongoDB 24-char ObjectId hex string
      const idStr = ord._id || ord.id || '';
      if (typeof idStr === 'string' && idStr.length === 24) {
        const timestampHex = idStr.substring(0, 8);
        const parsedTimestamp = parseInt(timestampHex, 16) * 1000;
        if (!isNaN(parsedTimestamp)) return parsedTimestamp;
      }
      return 0;
    };

    // 2. Sort so latest/newest order is placed at top (Descending)
    return [...filtered].sort((a, b) => {
      const timeA = getOrderTimestamp(a);
      const timeB = getOrderTimestamp(b);
      return timeB - timeA;
    });
  }, [orders, searchQuery, statusFilter, dateFilter, selectedDate]);

  // Quick Filter Handlers
  const handleSelectToday = () => {
    setDateFilter('today');
    setSelectedDate(getTodayStr());
  };

  const handleSelectYesterday = () => {
    setDateFilter('yesterday');
    const yday = new Date();
    yday.setDate(yday.getDate() - 1);
    setSelectedDate(formatLocalYYYYMMDD(yday));
  };

  const handleSelectAllDates = () => {
    setDateFilter('all');
    setSelectedDate('');
  };

  const handleCustomDateChange = (dateVal: string) => {
    setSelectedDate(dateVal);
    if (dateVal) {
      setDateFilter('custom');
    } else {
      setDateFilter('all');
    }
  };

  const handleDeleteOrder = async (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!orderId) return;
    if (window.confirm('Are you sure you want to delete this order record?')) {
      try {
        await posApi.deleteOrder(orderId);
        setOrders((prev) => prev.filter((o) => (o._id || o.id) !== orderId));
      } catch (err) {
        alert('Failed to delete order.');
      }
    }
  };

  const handlePrintReceipt = (_ord: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    window.print();
  };

  const handleDownloadPDF = (ord: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    const orderId = ord._id || ord.id || 'N/A';
    alert(`Downloading PDF for Order #${orderId}...`);
  };

  const toggleExpand = (orderId: string) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  return (
    <div className="p-6 bg-slate-950 text-slate-100 min-h-screen space-y-6">
      {/* Header Banner */}
      <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
          <Receipt className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Order History</h1>
          <p className="text-xs text-slate-400">View and manage past transactions.</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Box */}
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Order ID, Customer Name, or Phone..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Calendar Picker Input */}
          <div className="md:col-span-4 relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={selectedDate}
              onClick={(e) => e.currentTarget.showPicker?.()}
              onChange={(e) => handleCustomDateChange(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer [color-scheme:dark]"
            />
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/60">
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex gap-1">
              <button
                onClick={handleSelectToday}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  dateFilter === 'today' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Today
              </button>
              <button
                onClick={handleSelectYesterday}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  dateFilter === 'yesterday' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={handleSelectAllDates}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  dateFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Dates
              </button>
            </div>

            {/* STATUS FILTER */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 font-medium focus:outline-none focus:border-indigo-500 appearance-none pr-8 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="paid">Paid (Upfront)</option>
                <option value="settled">Settled (Credit Paid)</option>
                <option value="unsettled">Unsettled (Pending/Credit)</option>
              </select>
              <Filter className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Orders List / Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading orders history...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No orders found matching criteria.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredOrders.map((ord) => {
              const orderId = ord._id || ord.id || 'N/A';
              const items = ord.items || [];
              const subtotal = ord.subtotal ?? items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0);
              const total = ord.total ?? subtotal;
              const createdAt = ord.createdAt ? new Date(ord.createdAt).toLocaleString() : 'N/A';
              const isExpanded = expandedOrderId === orderId;

              // Extract payment details
              const paymentMethod = ((ord as any).paymentMethod || 'cash').toUpperCase();
              const customerName = (ord as any).customerName;
              const customerPhone = (ord as any).customerPhone;

              const statusStr = (ord.status || 'pending').toLowerCase();
              let badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

              if (statusStr === 'paid' || statusStr === 'settled') {
                badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
              } else if (statusStr === 'credit' || statusStr === 'unsettled') {
                badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
              }

              return (
                <div key={orderId} className="bg-slate-900 transition hover:bg-slate-800/30">
                  <div
                    onClick={() => toggleExpand(orderId)}
                    className="p-4 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <button className="text-slate-400 hover:text-slate-200">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-400">ORD-{orderId.slice(-6)}</span>
                          {ord.tableId && (
                            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                              Table #{ord.tableId}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{createdAt}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 md:gap-6">
                      {/* Payment Method Badge */}
                      <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                        <CreditCard className="w-3 h-3 text-indigo-400" />
                        <span className="text-[10px] font-mono font-semibold text-slate-300">
                          {paymentMethod}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase border ${badgeColor}`}>
                        {ord.status || 'pending'}
                      </span>

                      {/* Total Amount */}
                      <div className="font-mono text-sm font-bold text-slate-100 min-w-[80px] text-right">
                        Rs. {total.toFixed(0)}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handlePrintReceipt(ord, e)}
                          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
                          title="Print Receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDownloadPDF(ord, e)}
                          className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
                          title="Download Invoice"
                        >
                          <FileDown className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteOrder(orderId, e)}
                          className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition"
                          title="Delete Order"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Items & Details */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-950/60 border-t border-slate-800/80 space-y-3">
                      {customerName && (
                        <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 p-2.5 rounded-xl text-xs text-indigo-300">
                          <User className="w-4 h-4 text-indigo-400" />
                          <span>
                            <strong>Customer Details:</strong> {customerName} {customerPhone ? `(${customerPhone})` : ''}
                          </span>
                        </div>
                      )}

                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Order Items</div>
                        <div className="space-y-1.5">
                          {items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-xs text-slate-300 font-mono">
                              <span>
                                {item.quantity}x {item.name}
                              </span>
                              <span>Rs. {((item.price || 0) * (item.quantity || 1)).toFixed(0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};