import React, { useState } from 'react';
import {
  X,
  Printer,
  Edit2,
  Plus,
  Banknote,
  QrCode,
  Layers,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  User,
  Phone,
} from 'lucide-react';
import type { Table, Order } from '../types';
import { posApi } from '../api/posApi';

interface TableDetailModalProps {
  table: Table;
  order: Order | undefined;
  onClose: () => void;
  onAddItems: () => void;
  onPayOrder: (
    orderId: string,
    paymentMethod: string,
    customerDetails?: { customerName: string; customerPhone: string }
  ) => Promise<void>;
  onVoidOrder: (tableId: string) => Promise<void>;
}

export const TableDetailModal: React.FC<TableDetailModalProps> = ({
  table,
  order,
  onClose,
  onAddItems,
  onPayOrder,
  onVoidOrder,
}) => {
  // Safe helper to get reliable order ID
  const orderId = order?._id || order?.id || '';
  const tableId = table._id || table.id || '';

  // State management
  const [customerName, setCustomerName] = useState<string>(order?.customerName || 'NO NAME');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'fonepay' | 'split' | 'credit'>('cash');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Credit details state (auto-populate name if available)
  const [creditCustomerName, setCreditCustomerName] = useState<string>(
    order?.customerName && order.customerName !== 'NO NAME' ? order.customerName : ''
  );
  const [creditCustomerPhone, setCreditCustomerPhone] = useState<string>(order?.customerPhone || '');

  const subtotal = order ? (order.items || []).reduce((sum, item) => sum + item.price * item.quantity, 0) : 0;
  const total = order ? order.total ?? subtotal : 0;

  const handleSaveName = () => {
    setIsEditingName(false);
    if (!creditCustomerName && customerName !== 'NO NAME') {
      setCreditCustomerName(customerName);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePayment = async () => {
    if (!order || !orderId) return;
    setIsProcessing(true);

    try {
      if (paymentMethod === 'credit') {
        const nameToUse = creditCustomerName.trim() || (customerName !== 'NO NAME' ? customerName.trim() : '');
        const phoneToUse = creditCustomerPhone.trim();

        if (!nameToUse || !phoneToUse) {
          alert('Please enter both Customer Name and Phone Number for credit orders.');
          setIsProcessing(false);
          return;
        }

        // Call specific API endpoint for credit processing
        await posApi.processFullCredit(orderId, nameToUse, phoneToUse);

        // Notify parent state handler
        await onPayOrder(orderId, 'credit', {
          customerName: nameToUse,
          customerPhone: phoneToUse,
        });
      } else {
        await onPayOrder(orderId, paymentMethod);
      }
      onClose();
    } catch (err) {
      alert('Failed to process order.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoid = async () => {
    if (!tableId) return;
    if (window.confirm(`Are you sure you want to void the order for Table ${table.number}?`)) {
      setIsProcessing(true);
      try {
        await onVoidOrder(tableId);
        onClose();
      } catch (err) {
        alert('Failed to void order.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Section */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-100">Table {table.number}</h2>
              
              {/* Customer Name Editor */}
              {isEditingName ? (
                <div className="flex items-center gap-1.5 ml-2">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="bg-slate-900 border border-indigo-500 rounded-lg px-2 py-0.5 text-xs text-indigo-300 focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    className="p-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-xs font-bold text-indigo-400 tracking-wide uppercase">
                    {customerName}
                  </span>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="text-slate-500 hover:text-indigo-400 transition"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Timestamp & Order ID */}
            {order && (
              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>2m ago</span>
                <span>•</span>
                <span className="text-slate-500">ORD-{orderId.slice(-8)}</span>
              </div>
            )}
          </div>

          {/* Action Icons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditingName(!isEditingName)}
              className="p-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl transition"
              title="Edit Table Info"
            >
              <Edit2 className="w-4 h-4" />
            </button>

            <button
              onClick={handlePrint}
              className="p-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl transition"
              title="Print KOT / Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-xl transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          
          {/* Order Items List */}
          {!order || !order.items || order.items.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No active items ordered for Table {table.number}.
            </div>
          ) : (
            <div className="space-y-3">
              {order.items.map((item, idx) => (
                <div
                  key={item._id || item.menuItemId || idx}
                  className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-2xl flex justify-between items-center"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">{item.name}</span>
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                        NEW
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      × {item.quantity} @ Rs. {(item.price || 0).toFixed(0)}
                    </div>
                  </div>

                  <div className="font-mono text-sm font-bold text-slate-100">
                    Rs. {((item.price || 0) * (item.quantity || 0)).toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total Breakdown */}
          <div className="bg-slate-950/80 border border-slate-800/80 p-4 rounded-2xl flex justify-between items-center">
            <span className="text-base font-bold text-slate-200">Total</span>
            <span className="text-xl font-black font-mono text-indigo-400">
              Rs. {total.toFixed(0)}
            </span>
          </div>

          {/* Add Items Action */}
          <button
            onClick={onAddItems}
            className="w-full py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2 tracking-wider uppercase"
          >
            <Plus className="w-4 h-4" /> Add Items
          </button>

          {/* Payment Method Selector */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Payment Method
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`p-3.5 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                  paymentMethod === 'cash'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Banknote className="w-4 h-4" /> Cash
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('fonepay')}
                className={`p-3.5 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                  paymentMethod === 'fonepay'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <QrCode className="w-4 h-4" /> FonePay  OR <CreditCard className="w-4 h-4" /> Card
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('split')}
                className={`p-3.5 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                  paymentMethod === 'split'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Layers className="w-4 h-4" /> Custom Split
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('credit')}
                className={`p-3.5 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                  paymentMethod === 'credit'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 ring-2 ring-amber-500/30'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <CreditCard className="w-4 h-4" /> Full Credit
              </button>
            </div>

            {/* Dynamic Customer Details Fields for Full Credit */}
            {paymentMethod === 'credit' && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl space-y-3 mt-3">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                  Credit Customer Details
                </span>
                
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Customer Name (e.g. Subin)"
                    value={creditCustomerName}
                    onChange={(e) => setCreditCustomerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Mobile Number (e.g. 9812345678)"
                    value={creditCustomerPhone}
                    onChange={(e) => setCreditCustomerPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/50 space-y-3">
          <button
            onClick={handlePayment}
            disabled={!order || !order.items || order.items.length === 0 || isProcessing}
            className={`w-full py-4 font-bold rounded-2xl text-sm transition flex items-center justify-center gap-2 shadow-lg ${
              paymentMethod === 'credit'
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
            } disabled:opacity-40`}
          >
            <CheckCircle2 className="w-4 h-4" />
            {paymentMethod === 'credit'
              ? `Record Credit Order — Rs. ${total.toFixed(0)}`
              : `Mark as Paid — Rs. ${total.toFixed(0)}`}
          </button>

          <div className="text-center">
            <button
              onClick={handleVoid}
              disabled={isProcessing}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold transition inline-flex items-center gap-1.5 py-1"
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Void Order
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};