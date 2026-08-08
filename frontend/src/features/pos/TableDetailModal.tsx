import React, { useState } from 'react';
import {
  X,
  Printer,
  Edit2,
  Plus,
  Banknote,
  QrCode,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  User,
  Phone,
  Split,
  Tag,
  HandCoins,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Table, Order } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { posApi } from '../../api/posApi';

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
  onVoidOrder: (tableId: string, reason: string) => Promise<void>;
}

export const TableDetailModal: React.FC<TableDetailModalProps> = ({
  table,
  order,
  onClose,
  onAddItems,
  onPayOrder,
  onVoidOrder,
}) => {
  const { currentRestaurant, currentLocation, hasPermission } = useAuth();
  const orderId = order?._id || order?.id || '';
  const tableId = table._id || table.id || '';

  const [updatedOrder, setUpdatedOrder] = useState<Order | null>(null);
  const [isDiscountFormOpen, setIsDiscountFormOpen] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [discountReason, setDiscountReason] = useState('');
  const [isApplyingDiscount, setIsApplyingDiscount] = useState(false);
  const [discountError, setDiscountError] = useState('');

  const [isSeatSplitOpen, setIsSeatSplitOpen] = useState(false);

  const [loyaltyPhone, setLoyaltyPhone] = useState('');
  const [loyaltyName, setLoyaltyName] = useState('');
  const [isAttachingCustomer, setIsAttachingCustomer] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState('');
  const [loyaltyPointsBalance, setLoyaltyPointsBalance] = useState<number | null>(null);
  const [redeemPointsValue, setRedeemPointsValue] = useState<string>('');
  const [isRedeemingPoints, setIsRedeemingPoints] = useState(false);
  const [redeemError, setRedeemError] = useState('');

  const [isTipFormOpen, setIsTipFormOpen] = useState(false);
  const [tipType, setTipType] = useState<'percent' | 'flat'>('percent');
  const [tipValue, setTipValue] = useState<string>('');
  const [isApplyingTip, setIsApplyingTip] = useState(false);
  const [tipError, setTipError] = useState('');

  const displayOrder = updatedOrder || order;

  const [customerName, setCustomerName] = useState<string>(order?.customerName || 'NO NAME');
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'fonepay' | 'card' | 'split' | 'credit'>('cash');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(false);
  const [cachedOrderItems] = useState(order?.items || []);

  const [splitCash, setSplitCash] = useState<number | ''>('');
  const [splitCard, setSplitCard] = useState<number | ''>('');
  const [splitQr, setSplitQr] = useState<number | ''>('');

  const [creditCustomerName, setCreditCustomerName] = useState<string>(
    order?.customerName && order.customerName !== 'NO NAME' ? order.customerName : ''
  );
  const [creditCustomerPhone, setCreditCustomerPhone] = useState<string>(order?.customerPhone || '');

  const itemsToDisplay = paymentSuccess && cachedOrderItems.length > 0 ? cachedOrderItems : (order?.items || []);

  const computedSubtotal = itemsToDisplay.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  // Prefer the backend's own subtotal/tax/total/discount — those are the
  // real numbers that get charged and recorded; the client-side sum above
  // is only a fallback for the brief window before the order has synced.
  const subtotal = displayOrder?.subtotal ?? computedSubtotal;
  const discount = displayOrder?.discount && displayOrder.discount.type ? displayOrder.discount : null;
  const tip = displayOrder?.tip && displayOrder.tip.type ? displayOrder.tip : null;
  const taxRatePercent = currentRestaurant?.taxRatePercent ?? 8;
  const tax = displayOrder?.tax ?? subtotal * (taxRatePercent / 100);
  const total = displayOrder?.total ?? subtotal + tax + (tip?.amount || 0);

  // Groups by seat, then proportionally allocates the *whole* bill (tax,
  // discount, tip included) by each seat's share of the pre-tax subtotal —
  // a flat item-price split would misstate what a seat actually owes once
  // a table-wide discount or tip is in play. Purely informational: actual
  // payment is still collected as one lump sum via the tender buttons below.
  const seatBreakdown = (() => {
    const bySeat = new Map<string, { label: string; seatSubtotal: number }>();
    for (const item of itemsToDisplay) {
      const key = item.seatNumber != null ? String(item.seatNumber) : 'shared';
      const label = item.seatNumber != null ? `Seat ${item.seatNumber}` : 'Shared / Unassigned';
      const lineTotal = (item.price || 0) * (item.quantity || 0);
      const existing = bySeat.get(key);
      if (existing) existing.seatSubtotal += lineTotal;
      else bySeat.set(key, { label, seatSubtotal: lineTotal });
    }
    return Array.from(bySeat.entries())
      .sort(([a], [b]) => (a === 'shared' ? -1 : b === 'shared' ? 1 : Number(a) - Number(b)))
      .map(([key, { label, seatSubtotal }]) => ({
        key,
        label,
        seatSubtotal,
        seatTotal: subtotal > 0 ? (seatSubtotal / subtotal) * total : 0,
      }));
  })();
  const hasSeatAssignments = itemsToDisplay.some((item) => item.seatNumber != null);
  const canDiscount = hasPermission('orders.discount');
  const canTip = hasPermission('orders.tip');
  const canAttachCustomer = hasPermission('orders.checkout');
  const canRedeemPoints = hasPermission('orders.discount');
  const pointValueRs = currentRestaurant?.loyaltyPointValueRs ?? 1;

  const resetDiscountForm = () => {
    setDiscountType('percent');
    setDiscountValue('');
    setDiscountReason('');
    setDiscountError('');
  };

  const handleApplyDiscount = async () => {
    if (!orderId) return;
    const value = Number(discountValue);
    if (!value || value <= 0) {
      setDiscountError('Enter a discount amount greater than 0.');
      return;
    }
    if (discountType === 'percent' && value > 100) {
      setDiscountError('A percentage discount cannot exceed 100%.');
      return;
    }
    setDiscountError('');
    setIsApplyingDiscount(true);
    try {
      const updated = await posApi.applyDiscount(orderId, { type: discountType, value, reason: discountReason });
      setUpdatedOrder(updated);
      setIsDiscountFormOpen(false);
      resetDiscountForm();
    } catch (err: any) {
      setDiscountError(err?.response?.data?.message || 'Failed to apply discount.');
    } finally {
      setIsApplyingDiscount(false);
    }
  };

  const handleRemoveDiscount = async () => {
    if (!orderId) return;
    setIsApplyingDiscount(true);
    try {
      const updated = await posApi.applyDiscount(orderId, { type: null });
      setUpdatedOrder(updated);
    } catch (err) {
      alert('Failed to remove discount.');
    } finally {
      setIsApplyingDiscount(false);
    }
  };

  const resetTipForm = () => {
    setTipType('percent');
    setTipValue('');
    setTipError('');
  };

  const handleApplyTip = async () => {
    if (!orderId) return;
    const value = Number(tipValue);
    if (!value || value <= 0) {
      setTipError('Enter a tip amount greater than 0.');
      return;
    }
    if (tipType === 'percent' && value > 100) {
      setTipError('A percentage tip cannot exceed 100%.');
      return;
    }
    setTipError('');
    setIsApplyingTip(true);
    try {
      const updated = await posApi.applyTip(orderId, { type: tipType, value });
      setUpdatedOrder(updated);
      setIsTipFormOpen(false);
      resetTipForm();
    } catch (err: any) {
      setTipError(err?.response?.data?.message || 'Failed to apply tip.');
    } finally {
      setIsApplyingTip(false);
    }
  };

  const handleRemoveTip = async () => {
    if (!orderId) return;
    setIsApplyingTip(true);
    try {
      const updated = await posApi.applyTip(orderId, { type: null });
      setUpdatedOrder(updated);
    } catch (err) {
      alert('Failed to remove tip.');
    } finally {
      setIsApplyingTip(false);
    }
  };

  const handleSaveName = () => {
    setIsEditingName(false);
    if (!creditCustomerName && customerName !== 'NO NAME') {
      setCreditCustomerName(customerName);
    }
  };

  const handleAttachLoyaltyCustomer = async () => {
    if (!orderId || !loyaltyPhone.trim()) {
      setLoyaltyError('Enter a phone number.');
      return;
    }
    setLoyaltyError('');
    setIsAttachingCustomer(true);
    try {
      const updated = await posApi.attachOrderCustomer(orderId, {
        customerName: loyaltyName.trim() || undefined,
        customerPhone: loyaltyPhone.trim(),
      });
      setUpdatedOrder(updated);
      if (updated.customerId) {
        const detail = await posApi.getCustomer(updated.customerId);
        setLoyaltyPointsBalance(detail.stats.pointsBalance);
      }
    } catch (err: any) {
      setLoyaltyError(err?.response?.data?.message || 'Failed to attach customer.');
    } finally {
      setIsAttachingCustomer(false);
    }
  };

  const handleRedeemPoints = async () => {
    if (!orderId) return;
    const points = Number(redeemPointsValue);
    if (!points || points <= 0) {
      setRedeemError('Enter a positive number of points.');
      return;
    }
    setRedeemError('');
    setIsRedeemingPoints(true);
    try {
      const result = await posApi.redeemLoyaltyPoints(orderId, points);
      setUpdatedOrder(result.order);
      setLoyaltyPointsBalance(result.pointsRemaining);
      setRedeemPointsValue('');
    } catch (err: any) {
      setRedeemError(err?.response?.data?.message || 'Failed to redeem points.');
    } finally {
      setIsRedeemingPoints(false);
    }
  };

  const handlePrintReceipt = () => {
    const printContent = document.getElementById('printable-receipt');
    if (!printContent) return;

    const WinPrint = window.open('', '', 'width=800,height=650');
    WinPrint?.document.write(`
      <html>
        <head>
          <title>Print Receipt - Invoice</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              color: #000;
              background: #fff;
              margin: 0;
              padding: 10px;
              font-size: 12px;
            }
            .receipt-container {
              max-width: 270px;
              margin: 0 auto;
              text-align: center;
            }
            .receipt-logo {
              width: 100px;
              max-height: 80px;
              object-fit: contain;
              margin: 0 auto 5px auto;
              display: block;
            }
            .header h2 { margin: 0; font-size: 14px; text-transform: uppercase; }
            .header p { margin: 2px 0; font-size: 10px; color: #333; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .details { text-align: left; font-size: 10px; margin-bottom: 8px; }
            .details div { display: flex; justify-between; margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; text-align: left; }
            th { border-bottom: 1px solid #000; padding-bottom: 3px; }
            td { padding: 3px 0; }
            .text-right { text-align: right; }
            .totals { margin-top: 8px; border-top: 1px dashed #000; padding-top: 4px; font-size: 10px; }
            .totals div { display: flex; justify-between; margin-bottom: 2px; }
            .totals .grand-total { font-weight: bold; font-size: 12px; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0; margin-top: 3px; }
            .footer { margin-top: 15px; font-size: 10px; text-align: center; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    WinPrint?.document.close();
    WinPrint?.focus();
    setTimeout(() => {
      WinPrint?.print();
      WinPrint?.close();
    }, 500);
  };

  const handlePayment = async () => {
    if (!order || !orderId) return;
    setIsProcessing(true);

    try {
      if (paymentMethod === 'split') {
        const cash = Number(splitCash) || 0;
        const card = Number(splitCard) || 0;
        const qr = Number(splitQr) || 0;

        const splitSum = cash + card + qr;
        const displayTotal = Number(total.toFixed(2));

        if (Math.abs(splitSum - displayTotal) > 0.01) {
          alert(`Split sum (Rs. ${splitSum}) must equal the total bill (Rs. ${displayTotal}).`);
          setIsProcessing(false);
          return;
        }

        const splitParts: string[] = [];
        if (cash > 0) splitParts.push(`Cash: Rs.${cash}`);
        if (card > 0) splitParts.push(`Card: Rs.${card}`);
        if (qr > 0) splitParts.push(`QR: Rs.${qr}`);

        const formattedMethod = `SPLIT (${splitParts.join(', ')})`;
        await onPayOrder(orderId, formattedMethod);
      } else if (paymentMethod === 'credit') {
        const nameToUse = creditCustomerName.trim() || (customerName !== 'NO NAME' ? customerName.trim() : '');
        const phoneToUse = creditCustomerPhone.trim();

        if (!nameToUse || !phoneToUse) {
          alert('Please enter both Customer Name and Phone Number for credit orders.');
          setIsProcessing(false);
          return;
        }

        await onPayOrder(orderId, 'credit', {
          customerName: nameToUse,
          customerPhone: phoneToUse,
        });
      } else {
        await onPayOrder(orderId, paymentMethod);
      }

      setPaymentSuccess(true);
    } catch (err: any) {
      console.error('Payment Error:', err);
      alert(err?.response?.data?.message || 'Failed to process order payment.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoid = async () => {
    if (!tableId) return;
    const reason = window.prompt(`Why are you voiding the order for Table ${table.number}? (required)`);
    if (reason === null) return;
    if (!reason.trim()) {
      alert('A reason is required to void an order.');
      return;
    }
    setIsProcessing(true);
    try {
      await onVoidOrder(tableId, reason.trim());
      onClose();
    } catch (err) {
      alert('Failed to void order.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-800 flex justify-between items-start bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-100">Table {table.number}</h2>
              {paymentSuccess ? (
                <span className="text-xs font-bold bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  Paid Successfully
                </span>
              ) : isEditingName ? (
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

            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{paymentSuccess ? 'Completed' : 'Active'}</span>
              {orderId && (
                <>
                  <span>•</span>
                  <span className="text-slate-500">ORD-{orderId.slice(-8)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!paymentSuccess && (
              <button
                onClick={() => setIsEditingName(!isEditingName)}
                className="p-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl transition"
                title="Edit Table Info"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handlePrintReceipt}
              className="p-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl transition"
              title="Print Receipt"
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

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {itemsToDisplay.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs">
              No items available for Table {table.number}.
            </div>
          ) : (
            <div className="space-y-3">
              {itemsToDisplay.map((item, idx) => (
                <div
                  key={item._id || item.menuItemId || idx}
                  className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-2xl flex justify-between items-center"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">{item.name}</span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      × {item.quantity} @ Rs. {(item.price || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-100">
                    Rs. {((item.price || 0) * (item.quantity || 0)).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-slate-950/80 border border-slate-800/80 p-4 rounded-2xl space-y-2">
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono">Rs. {subtotal.toFixed(2)}</span>
            </div>
            {discount && (
              <div className="flex justify-between items-center text-xs text-emerald-400">
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3 h-3" />
                  Discount {discount.type === 'percent' ? `(${discount.value}%)` : ''}
                  {discount.reason && <span className="text-slate-500">— {discount.reason}</span>}
                  {!paymentSuccess && canDiscount && (
                    <button
                      onClick={handleRemoveDiscount}
                      disabled={isApplyingDiscount}
                      className="text-slate-500 hover:text-rose-400 transition disabled:opacity-50"
                      title="Remove discount"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
                <span className="font-mono">- Rs. {discount.amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs text-slate-400">
              <span>Tax ({taxRatePercent % 1 === 0 ? taxRatePercent : taxRatePercent.toFixed(1)}%)</span>
              <span className="font-mono">Rs. {tax.toFixed(2)}</span>
            </div>
            {tip && (
              <div className="flex justify-between items-center text-xs text-amber-400">
                <span className="flex items-center gap-1.5">
                  <HandCoins className="w-3 h-3" />
                  Tip {tip.type === 'percent' ? `(${tip.value}%)` : ''}
                  {!paymentSuccess && canTip && (
                    <button
                      onClick={handleRemoveTip}
                      disabled={isApplyingTip}
                      className="text-slate-500 hover:text-rose-400 transition disabled:opacity-50"
                      title="Remove tip"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </span>
                <span className="font-mono">+ Rs. {tip.amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              <span className="text-base font-bold text-slate-200">Total</span>
              <span className="text-xl font-black font-mono text-indigo-400">Rs. {total.toFixed(2)}</span>
            </div>
          </div>

          {hasSeatAssignments && (
            <div>
              <button
                onClick={() => setIsSeatSplitOpen((prev) => !prev)}
                className="text-[11px] font-semibold text-teal-400 hover:text-teal-300 transition inline-flex items-center gap-1.5"
              >
                <Users className="w-3 h-3" /> Split by seat
                {isSeatSplitOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {isSeatSplitOpen && (
                <div className="mt-2 bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
                  <p className="text-[10px] text-slate-500 mb-1">
                    Tax, discount, and tip allocated proportionally — informational only, still one payment below.
                  </p>
                  {seatBreakdown.map((seat) => (
                    <div key={seat.key} className="flex justify-between items-center text-xs">
                      <span className="text-slate-300 font-medium">{seat.label}</span>
                      <span className="font-mono text-teal-400 font-bold">Rs. {seat.seatTotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!paymentSuccess && canAttachCustomer && (
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Loyalty
              </span>

              {!displayOrder?.customerId ? (
                <>
                  {loyaltyError && <div className="text-[11px] text-rose-400">{loyaltyError}</div>}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={loyaltyName}
                      onChange={(e) => setLoyaltyName(e.target.value)}
                      placeholder="Name (optional)"
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="text"
                      value={loyaltyPhone}
                      onChange={(e) => setLoyaltyPhone(e.target.value)}
                      placeholder="Phone *"
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAttachLoyaltyCustomer}
                    disabled={isAttachingCustomer}
                    className="w-full py-1.5 text-[11px] font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-50"
                  >
                    {isAttachingCustomer ? 'Looking up…' : 'Attach Loyalty Customer'}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-medium">{displayOrder.customerName || 'Customer'}</span>
                    {loyaltyPointsBalance !== null && (
                      <span className="font-mono text-amber-400 font-bold">{loyaltyPointsBalance} pts available</span>
                    )}
                  </div>
                  {canRedeemPoints && !discount && (loyaltyPointsBalance ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      {redeemError && <div className="text-[11px] text-rose-400">{redeemError}</div>}
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          max={loyaltyPointsBalance ?? undefined}
                          value={redeemPointsValue}
                          onChange={(e) => setRedeemPointsValue(e.target.value)}
                          placeholder={`Up to ${loyaltyPointsBalance}`}
                          className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={handleRedeemPoints}
                          disabled={isRedeemingPoints}
                          className="px-3 py-1.5 text-[11px] font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-50 whitespace-nowrap"
                        >
                          {isRedeemingPoints ? 'Redeeming…' : 'Redeem'}
                        </button>
                      </div>
                      {Number(redeemPointsValue) > 0 && (
                        <p className="text-[10px] text-slate-500">
                          ≈ Rs. {(Number(redeemPointsValue) * pointValueRs).toFixed(2)} off
                        </p>
                      )}
                    </div>
                  )}
                  {discount && (
                    <p className="text-[10px] text-slate-500">Remove the current discount to redeem points.</p>
                  )}
                </>
              )}
            </div>
          )}

          {!paymentSuccess && canDiscount && !discount && (
            <div>
              {!isDiscountFormOpen ? (
                <button
                  onClick={() => setIsDiscountFormOpen(true)}
                  className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition inline-flex items-center gap-1.5"
                >
                  <Tag className="w-3 h-3" /> Apply discount
                </button>
              ) : (
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                  {discountError && <div className="text-[11px] text-rose-400">{discountError}</div>}
                  <div className="flex gap-2">
                    <div className="flex rounded-lg border border-slate-800 overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => setDiscountType('percent')}
                        className={`px-2.5 py-1.5 text-[11px] font-bold ${discountType === 'percent' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'}`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiscountType('flat')}
                        className={`px-2.5 py-1.5 text-[11px] font-bold ${discountType === 'flat' ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400'}`}
                      >
                        Rs.
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'percent' ? 'e.g. 10' : 'e.g. 50'}
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDiscountFormOpen(false);
                        resetDiscountForm();
                      }}
                      className="flex-1 py-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-200 border border-slate-800 rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyDiscount}
                      disabled={isApplyingDiscount}
                      className="flex-1 py-1.5 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50"
                    >
                      {isApplyingDiscount ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!paymentSuccess && canTip && !tip && (
            <div>
              {!isTipFormOpen ? (
                <button
                  onClick={() => setIsTipFormOpen(true)}
                  className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition inline-flex items-center gap-1.5"
                >
                  <HandCoins className="w-3 h-3" /> Add tip
                </button>
              ) : (
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                  {tipError && <div className="text-[11px] text-rose-400">{tipError}</div>}
                  <div className="flex gap-2">
                    <div className="flex rounded-lg border border-slate-800 overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => setTipType('percent')}
                        className={`px-2.5 py-1.5 text-[11px] font-bold ${tipType === 'percent' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400'}`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => setTipType('flat')}
                        className={`px-2.5 py-1.5 text-[11px] font-bold ${tipType === 'flat' ? 'bg-amber-500 text-slate-950' : 'bg-slate-900 text-slate-400'}`}
                      >
                        Rs.
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={tipValue}
                      onChange={(e) => setTipValue(e.target.value)}
                      placeholder={tipType === 'percent' ? 'e.g. 10' : 'e.g. 50'}
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsTipFormOpen(false);
                        resetTipForm();
                      }}
                      className="flex-1 py-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-200 border border-slate-800 rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyTip}
                      disabled={isApplyingTip}
                      className="flex-1 py-1.5 text-[11px] font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition disabled:opacity-50"
                    >
                      {isApplyingTip ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!paymentSuccess ? (
            <>
              <button
                onClick={onAddItems}
                className="w-full py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-2xl transition flex items-center justify-center gap-2 tracking-wider uppercase"
              >
                <Plus className="w-4 h-4" /> Add Items
              </button>

              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Select Payment Method
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      paymentMethod === 'cash'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <Banknote className="w-4 h-4" /> Cash
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      paymentMethod === 'card'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" /> Card
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('fonepay')}
                    className={`p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      paymentMethod === 'fonepay'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <QrCode className="w-4 h-4" /> QR / FonePay
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('split')}
                    className={`p-3 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      paymentMethod === 'split'
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 ring-2 ring-indigo-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <Split className="w-4 h-4" /> Custom Split
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('credit')}
                    className={`p-3 sm:col-span-2 rounded-2xl border text-xs font-bold transition flex items-center justify-center gap-2 ${
                      paymentMethod === 'credit'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300 ring-2 ring-amber-500/30'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <User className="w-4 h-4" /> Full Credit Ledger
                  </button>
                </div>

                {paymentMethod === 'split' && (
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3 mt-3">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block">
                      Custom Split Allocation
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Cash (Rs)</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={splitCash}
                          onChange={(e) => setSplitCash(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Card (Rs)</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={splitCard}
                          onChange={(e) => setSplitCard(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs text-indigo-400 font-mono font-bold focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">QR (Rs)</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={splitQr}
                          onChange={(e) => setSplitQr(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs text-teal-400 font-mono font-bold focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {paymentMethod === 'credit' && (
                  <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl space-y-3 mt-3">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                      Credit Ledger Customer Details
                    </span>

                    <div className="relative">
                      <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Customer Name *"
                        value={creditCustomerName}
                        onChange={(e) => setCreditCustomerName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="relative">
                      <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Mobile Number *"
                        value={creditCustomerPhone}
                        onChange={(e) => setCreditCustomerPhone(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/30 p-5 rounded-2xl text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <div>
                <h4 className="font-bold text-slate-100 text-sm">Payment Completed Successfully!</h4>
                <p className="text-xs text-slate-400 mt-0.5">Print receipt below or close window.</p>
              </div>
              <button
                onClick={handlePrintReceipt}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                <Printer className="w-4 h-4" /> Print Receipt Now
              </button>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-800 bg-slate-950/50 space-y-3">
          {!paymentSuccess ? (
            <>
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
                  ? `Record Credit Order — Rs. ${total.toFixed(2)}`
                  : `Pay — Rs. ${total.toFixed(2)}`}
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
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-2xl text-xs transition"
            >
              Close Window
            </button>
          )}
        </div>
      </div>

      {/* Hidden Printable Receipt Template */}
      <div id="printable-receipt" className="hidden">
        <div className="receipt-container">
          <div className="header">
            <img
              src={currentRestaurant?.logoUrl || '/assets/Logo.jpeg'}
              className='receipt-logo'
              alt="Logo"
            />
            <h2>{currentRestaurant?.name || 'Restaurant'}</h2>
            {currentLocation?.address && <p>{currentLocation.address}</p>}
            {currentLocation?.phone && <p>Phone: {currentLocation.phone}</p>}
          </div>

          <div className="divider"></div>

          <div className="details">
            <div><span>Table No:</span> <strong>#{table.number}</strong></div>
            <div><span>Invoice No:</span> <span>#INV-{orderId ? orderId.slice(-6) : '000000'}</span></div>
            <div><span>Date:</span> <span>{order?.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString()}</span></div>
          </div>

          <div className="divider"></div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Price</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {itemsToDisplay.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.name}</td>
                  <td className="text-right">{item.quantity}</td>
                  <td className="text-right">Rs.{(item.price || 0).toFixed(2)}</td>
                  <td className="text-right">Rs.{((item.price || 0) * (item.quantity || 0)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals">
            <div>
              <span>Subtotal:</span>
              <span>Rs.{subtotal.toFixed(2)}</span>
            </div>
            <div className="grand-total">
              <span>TOTAL:</span>
              <span>Rs.{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="footer">
            <p>Thank you!!! Do visit us again</p>
            <p>*** Powered by POS System ***</p>
          </div>
        </div>
      </div>
    </div>
  );
};