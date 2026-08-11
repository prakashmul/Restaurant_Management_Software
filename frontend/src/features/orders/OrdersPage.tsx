import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Calendar,
  Filter,
  Printer,
  Trash2,
  Receipt,
  ChevronDown,
  ChevronUp,
  CreditCard,
  User,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { posApi } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { escapeHtml } from '../../lib/escapeHtml';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import type { Order, Table } from '../../types';

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { isOwner, hasPermission, currentRestaurant, currentLocation } = useAuth();
  const currency = currentLocation?.currency || currentRestaurant?.currency || 'Rs.';
  const REFUNDABLE_STATUSES = ['paid', 'credit', 'unsettled', 'settled'];

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

  const fetchData = async () => {
    setLoading(true);
    try {
      const [orderData, tableData] = await Promise.all([
        posApi.getOrders(),
        posApi.getTables(),
      ]);
      setOrders(Array.isArray(orderData) ? orderData : []);
      setTables(Array.isArray(tableData) ? tableData : []);
    } catch (err) {
      console.error('Failed to load order history or tables:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation?.id]);

  useRealtimeRefresh(['order'], fetchData);

  // Helper to get matching table number for an order
  const getTableNumber = (tableId?: string) => {
    if (!tableId) return null;
    const foundTable = tables.find((t) => (t._id || t.id) === tableId);
    return foundTable ? foundTable.number : tableId;
  };

  // Filter & Sort Logic
  const filteredOrders = useMemo(() => {
    const filtered = orders.filter((order) => {
      const orderId = order._id || order.id || '';
      const customerName = (order as any).customerName || '';
      const customerPhone = (order as any).customerPhone || '';

      const matchesSearch =
        !searchQuery ||
        orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customerPhone.includes(searchQuery);

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

    const getOrderTimestamp = (ord: Order): number => {
      if (ord.createdAt) {
        const t = new Date(ord.createdAt).getTime();
        if (!isNaN(t)) return t;
      }
      const idStr = ord._id || ord.id || '';
      if (typeof idStr === 'string' && idStr.length === 24) {
        const timestampHex = idStr.substring(0, 8);
        const parsedTimestamp = parseInt(timestampHex, 16) * 1000;
        if (!isNaN(parsedTimestamp)) return parsedTimestamp;
      }
      return 0;
    };

    return [...filtered].sort((a, b) => {
      const timeA = getOrderTimestamp(a);
      const timeB = getOrderTimestamp(b);
      return timeB - timeA;
    });
  }, [orders, searchQuery, statusFilter, dateFilter, selectedDate]);

  // Financial Summary Computations
  const financialSummary = useMemo(() => {
    let targetDate = getTodayStr();
    if (dateFilter === 'yesterday') {
      const yday = new Date();
      yday.setDate(yday.getDate() - 1);
      targetDate = formatLocalYYYYMMDD(yday);
    } else if (dateFilter === 'custom') {
      targetDate = selectedDate;
    }

    let todaysSale = 0;
    let creditPaid = 0;

    orders.forEach((order) => {
      const orderDate = formatLocalYYYYMMDD(order.createdAt);
      
      if (dateFilter !== 'all' && orderDate !== targetDate) return;

      const items = order.items || [];
      const subtotal = order.subtotal ?? items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0);
      const totalAmount = order.total ?? subtotal;
      const refunded = (order.refundHistory || []).reduce((sum, r) => sum + (r.amount || 0), 0);
      const netAmount = Math.max(0, totalAmount - refunded);
      const status = (order.status || 'pending').toLowerCase();
      const method = ((order as any).paymentMethod || '').toLowerCase();

      // Direct Sales
      if (status === 'paid' && method !== 'credit') {
        todaysSale += netAmount;
      }

      // Credit Paid — count actual payments received against credit orders
      // (partial or full), not just orders that reached full settlement,
      // so a partial credit payment shows up immediately instead of only
      // once the whole balance is paid off.
      if (status === 'credit' || status === 'unsettled' || status === 'settled') {
        const creditReceived = (order.paymentHistory || []).reduce((sum, p) => sum + (p.amount || 0), 0);
        creditPaid += Math.max(0, creditReceived - refunded);
      }
    });

    return {
      todaysSale,
      creditPaid,
      totalReceived: todaysSale + creditPaid,
    };
  }, [orders, dateFilter, selectedDate]);

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
    const reason = window.prompt('Why are you deleting this order record? (required)');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('A reason is required to delete an order.');
      return;
    }
    try {
      await posApi.deleteOrder(orderId, reason.trim());
      setOrders((prev) => prev.filter((o) => (o._id || o.id) !== orderId));
    } catch (err) {
      alert('Failed to delete order.');
    }
  };

  const handleRefundOrder = async (ord: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    const orderId = ord._id || ord.id;
    if (!orderId) return;

    const total = ord.total ?? 0;
    const alreadyRefunded = (ord.refundHistory || []).reduce((sum, r) => sum + (r.amount || 0), 0);
    const maxRefundable = Math.max(0, total - alreadyRefunded);
    if (maxRefundable <= 0.01) {
      alert('This order has already been fully refunded.');
      return;
    }

    const amountStr = window.prompt(
      `How much to refund? (up to ${currency} ${maxRefundable.toFixed(2)})`,
      maxRefundable.toFixed(2)
    );
    if (amountStr === null) return;
    const amount = Number(amountStr);
    if (!amount || amount <= 0 || amount > maxRefundable + 0.01) {
      alert(`Enter a valid amount up to ${currency} ${maxRefundable.toFixed(2)}.`);
      return;
    }

    const reason = window.prompt('Why is this order being refunded? (required)');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('A reason is required to refund an order.');
      return;
    }

    const isFull = amount >= maxRefundable - 0.01;
    if (
      !window.confirm(
        isFull
          ? "This restores the order's deducted stock and marks it refunded. Continue?"
          : `Refund ${currency} ${amount.toFixed(2)} from this order? It stays active with the remaining balance.`
      )
    )
      return;

    try {
      const updated = await posApi.refundOrder(orderId, reason.trim(), amount);
      setOrders((prev) => prev.map((o) => ((o._id || o.id) === orderId ? updated : o)));
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to refund order.');
    }
  };

  const handlePrintReceipt = (ord: Order, e: React.MouseEvent) => {
    e.stopPropagation();

    const orderId = ord._id || ord.id || 'N/A';
    const items = ord.items || [];
    const subtotal = ord.subtotal ?? items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0);
    const total = ord.total ?? subtotal;
    const createdAt = ord.createdAt ? new Date(ord.createdAt).toLocaleString() : 'N/A';
    const tableNum = getTableNumber(ord.tableId);

    const printWindow = window.open('', '_blank', 'width=800,height=650');
    if (!printWindow) {
      alert('Please allow popups to print receipts.');
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Receipt - Invoice</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; color: #000; background: #fff; margin: 0; padding: 10px; font-size: 12px; }
            .receipt-container { max-width: 270px; margin: 0 auto; text-align: center; }
            .receipt-logo { width: 100px; max-height: 80px; object-fit: contain; margin: 0 auto 5px auto; display: block; }
            .header h2 { margin: 0; font-size: 14px; text-transform: uppercase; }
            .header p { margin: 2px 0; font-size: 10px; color: #333; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .details { text-align: left; font-size: 10px; margin-bottom: 8px; }
            .details div { display: flex; justify-content: space-between; margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; text-align: left; }
            th { border-bottom: 1px solid #000; padding-bottom: 3px; }
            td { padding: 3px 0; }
            .text-right { text-align: right; }
            .totals { margin-top: 8px; border-top: 1px dashed #000; padding-top: 4px; font-size: 10px; }
            .totals div { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .totals .grand-total { font-weight: bold; font-size: 12px; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0; margin-top: 3px; }
            .footer { margin-top: 15px; font-size: 10px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <img src="${escapeHtml(currentRestaurant?.logoUrl || '/assets/Logo.jpeg')}" class="receipt-logo" alt="Logo" />
              <h2>${escapeHtml(currentRestaurant?.name || 'Restaurant')}</h2>
              ${currentLocation?.address ? `<p>${escapeHtml(currentLocation.address)}</p>` : ''}
              ${currentLocation?.phone ? `<p>Phone: ${escapeHtml(currentLocation.phone)}</p>` : ''}
            </div>
            <div class="divider"></div>
            <div class="details">
              ${tableNum ? `<div><span>Table No:</span> <strong>#${tableNum}</strong></div>` : ''}
              <div><span>Invoice No:</span> <span>#INV-${orderId.slice(-6)}</span></div>
              <div><span>Date:</span> <span>${createdAt}</span></div>
            </div>
            <div class="divider"></div>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th class="text-right">Qty</th>
                  <th class="text-right">Price</th>
                  <th class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td class="text-right">${item.quantity}</td>
                    <td class="text-right">${currency}${(item.price || 0).toFixed(2)}</td>
                    <td class="text-right">${currency}${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="totals">
              <div><span>Subtotal:</span><span>${currency}${subtotal.toFixed(2)}</span></div>
              <div class="grand-total"><span>TOTAL:</span><span>${currency}${total.toFixed(2)}</span></div>
            </div>
            <div class="footer">
              <p>Thank you!!! Do visit us again</p>
              <p>*** Powered by POS System ***</p>
            </div>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
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

      {/* Financial Summary Cards Bar - Strictly Visible ONLY to Owners */}
      {isOwner && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">
                {dateFilter === 'today'
                  ? "Today's Sale"
                  : dateFilter === 'yesterday'
                  ? "Yesterday's Sale"
                  : dateFilter === 'all'
                  ? 'Total Direct Sales'
                  : 'Selected Date Sales'}
              </span>
              <div className="text-xl font-bold font-mono text-slate-100">
                {currency}{financialSummary.todaysSale.toFixed(2)}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Credit Paid</span>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {currency}{financialSummary.creditPaid.toFixed(2)}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-medium">Total Amount Received</span>
              <div className="text-xl font-bold font-mono text-cyan-400">
                {currency}{financialSummary.totalReceived.toFixed(2)}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
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

      {/* Orders List */}
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
              const tableNum = getTableNumber(ord.tableId);

              const paymentMethod = ((ord as any).paymentMethod || 'cash').toUpperCase();
              const customerName = (ord as any).customerName;
              const customerPhone = (ord as any).customerPhone;

              const statusStr = (ord.status || 'pending').toLowerCase();
              let badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';

              if (statusStr === 'paid' || statusStr === 'settled') {
                badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
              } else if (statusStr === 'credit' || statusStr === 'unsettled') {
                badgeColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
              } else if (statusStr === 'refunded') {
                badgeColor = 'bg-slate-700/40 text-slate-400 border-slate-600/40';
              }

              const canRefund = hasPermission('orders.refund') && REFUNDABLE_STATUSES.includes(statusStr);
              const totalRefunded = (ord.refundHistory || []).reduce((sum, r) => sum + (r.amount || 0), 0);
              const netTotal = Math.max(0, total - totalRefunded);
              const isPartiallyRefunded = totalRefunded > 0 && statusStr !== 'refunded';

              return (
                <div key={orderId} className="bg-slate-900 transition hover:bg-slate-800/30">
                  <div
                    onClick={() => toggleExpand(orderId)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <button className="text-slate-400 hover:text-slate-200">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-400">ORD-{orderId.slice(-6)}</span>
                          {tableNum && (
                            <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                              Table #{tableNum}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{createdAt}</div>
                      </div>
                    </div>

                    <div className="flex items-center flex-wrap gap-3 sm:gap-4 md:gap-6 pl-9 sm:pl-0">
                      <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                        <CreditCard className="w-3 h-3 text-indigo-400" />
                        <span className="text-[10px] font-mono font-semibold text-slate-300">
                          {paymentMethod}
                        </span>
                      </div>

                      <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase border ${badgeColor}`}>
                        {ord.status || 'pending'}
                      </span>

                      <div className="min-w-[80px] text-right">
                        <div className="font-mono text-sm font-bold text-slate-100">
                          {currency}{(isPartiallyRefunded ? netTotal : total).toFixed(2)}
                        </div>
                        {isPartiallyRefunded && (
                          <div className="text-[9px] text-amber-400 font-semibold whitespace-nowrap">
                            {currency}{totalRefunded.toFixed(2)} refunded
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handlePrintReceipt(ord, e)}
                          className="p-3 sm:p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition"
                          title="Print Receipt"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {canRefund && (
                          <button
                            onClick={(e) => handleRefundOrder(ord, e)}
                            className="p-3 sm:p-2 hover:bg-amber-500/10 rounded-lg text-slate-400 hover:text-amber-400 transition"
                            title="Refund Order"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDeleteOrder(orderId, e)}
                          className="p-3 sm:p-2 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition"
                          title="Delete Order"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Order Content */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-950/60 border-t border-slate-800/80 space-y-4">
                      {ord.refundHistory && ord.refundHistory.length > 0 && (
                        <div className="space-y-1.5">
                          {ord.refundHistory.map((r, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 bg-slate-800/60 border border-slate-700 p-2.5 rounded-xl text-xs text-slate-300"
                            >
                              <RotateCcw className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                              <span>
                                <strong>Refunded:</strong> {currency}{r.amount.toFixed(2)} — {r.reason}
                                {r.refundedBy ? ` (by ${r.refundedBy})` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
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
                              <span>{currency}{((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800/80 flex flex-col items-end text-xs font-mono space-y-1">
                        <div className="flex justify-between w-full max-w-xs text-slate-400">
                          <span>Subtotal:</span>
                          <span>{currency}{subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between w-full max-w-xs font-bold text-sm text-slate-100 pt-1 border-t border-slate-800">
                          <span>Total Order Amount:</span>
                          <span className={isPartiallyRefunded ? 'text-slate-500 line-through' : 'text-emerald-400'}>
                            {currency}{total.toFixed(2)}
                          </span>
                        </div>
                        {isPartiallyRefunded && (
                          <div className="flex justify-between w-full max-w-xs font-bold text-sm">
                            <span className="text-slate-100">Net After Refund:</span>
                            <span className="text-amber-400">{currency}{netTotal.toFixed(2)}</span>
                          </div>
                        )}
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