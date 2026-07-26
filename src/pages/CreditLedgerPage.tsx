// import { useState, useEffect, useMemo } from 'react';
// import { Wallet, Search, Download, TrendingUp, Receipt, Phone, MessageSquare, ArrowUpRight, User, CheckCircle2 } from 'lucide-react';
// import { posApi } from '../api/posApi';
// import type { Order } from '../types';

// interface CustomerCredit {
//   id: string;
//   name: string;
//   phone: string;
//   ordersCount: number;
//   debtOwed: number;
//   lastOrderDate?: string;
//   orderIds: string[];
//   isFullySettled: boolean;
// }

// export const CreditLedgerPage = () => {
//   const [activeTab, setActiveTab] = useState<'active' | 'history' | 'settlements'>('active');
//   const [searchQuery, setSearchQuery] = useState('');
//   const [orders, setOrders] = useState<Order[]>([]);
//   const [loading, setLoading] = useState(true);

//   // Fetch all orders from backend
//   const fetchCreditOrders = async () => {
//     try {
//       setLoading(true);
//       const allOrders = await posApi.getOrders();
//       setOrders(allOrders || []);
//     } catch (err) {
//       console.error('Failed to load credit orders:', err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchCreditOrders();
//   }, []);

//   // Settle all credit orders for a customer while retaining paymentMethod='credit'
//   const handleSettleCustomerDebt = async (customer: CustomerCredit) => {
//     if (!window.confirm(`Mark Rs. ${customer.debtOwed.toLocaleString()} as PAID for ${customer.name}?`)) return;

//     try {
//       setLoading(true);
//       // Retain 'credit' payment method so it moves to Settlements & History instead of disappearing
//       await Promise.all(customer.orderIds.map((orderId) => posApi.payOrder(orderId, 'credit')));
//       alert(`Credit balance settled for ${customer.name}! Moved to Settlements.`);
//       await fetchCreditOrders();
//     } catch (err) {
//       console.error('Failed to settle credit debt:', err);
//       alert('Failed to settle credit balance.');
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Filter orders by payment method and tab status
//   const creditOrders = useMemo(() => {
//     return orders.filter((o) => {
//       // Cast to string to safely bypass TypeScript literal union type checks
//       const orderStatus = o.status as string;
//       const paymentMethod = o.paymentMethod as string;

//       const isCredit = paymentMethod === 'credit' || orderStatus === 'credit' || orderStatus === 'unsettled';
//       if (!isCredit) return false;

//       if (activeTab === 'active') {
//         return (
//           orderStatus === 'pending' ||
//           orderStatus === 'unsettled' ||
//           orderStatus === 'credit'
//         );
//       }
//       if (activeTab === 'settlements') {
//         return orderStatus === 'paid' || orderStatus === 'settled';
//       }
//       // 'history' tab shows ALL credit orders (both paid & unpaid)
//       return true;
//     });
//   }, [orders, activeTab]);

//   // Dynamically aggregate debt by Customer (grouped by Phone or Customer Name)
//   const customerLedger = useMemo(() => {
//     const customerMap = new Map<string, CustomerCredit>();

//     creditOrders.forEach((order) => {
//       const key = order.customerPhone || order.customerName || 'Unknown';
//       const existing = customerMap.get(key);

//       const orderTotal = order.totalAmount || order.total || order.items?.reduce((s, i) => s + (i.price * i.quantity), 0) || 0;
//       const orderId = order._id || order.id || '';
//       const isPaid = order.status === 'paid' || order.status === 'settled';

//       if (existing) {
//         existing.ordersCount += 1;
//         existing.debtOwed += orderTotal;
//         if (orderId && !existing.orderIds.includes(orderId)) {
//           existing.orderIds.push(orderId);
//         }
//         // If any order in the group is unpaid, mark customer as not fully settled
//         if (!isPaid) {
//           existing.isFullySettled = false;
//         }
//       } else {
//         customerMap.set(key, {
//           id: orderId || key,
//           name: order.customerName || 'Guest Customer',
//           phone: order.customerPhone || 'N/A',
//           ordersCount: 1,
//           debtOwed: orderTotal,
//           lastOrderDate: order.createdAt,
//           orderIds: orderId ? [orderId] : [],
//           isFullySettled: isPaid,
//         });
//       }
//     });

//     return Array.from(customerMap.values());
//   }, [creditOrders]);

//   // Filter customers matching search input
//   const filteredCustomers = useMemo(() => {
//     return customerLedger.filter(
//       (c) =>
//         c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
//         c.phone.includes(searchQuery)
//     );
//   }, [customerLedger, searchQuery]);

//   // Metric aggregates
//   const totalDebt = useMemo(() => customerLedger.reduce((sum, c) => sum + c.debtOwed, 0), [customerLedger]);
//   const totalActiveOrders = useMemo(() => customerLedger.reduce((sum, c) => sum + c.ordersCount, 0), [customerLedger]);

//   // CSV Export Functionality
//   const handleExportCSV = () => {
//     if (filteredCustomers.length === 0) return alert('No data available to export');

//     const headers = ['Customer Name', 'Phone', 'Orders Count', 'Total Amount (Rs)', 'Status'];
//     const rows = filteredCustomers.map((c) => [
//       `"${c.name}"`,
//       `"${c.phone}"`,
//       c.ordersCount,
//       c.debtOwed,
//       c.isFullySettled ? 'Settled' : 'Unsettled',
//     ]);
    
//     const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
//     const encodedUri = encodeURI(csvContent);
//     const link = document.createElement('a');
//     link.setAttribute('href', encodedUri);
//     link.setAttribute('download', `credit_ledger_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`);
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//   };

//   return (
//     <div className="p-8 bg-slate-950 text-slate-100 min-h-screen space-y-8">
//       {/* HEADER SECTION */}
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-3xl font-extrabold flex items-center gap-3 text-white tracking-tight">
//             <span className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl">
//               <Wallet className="w-7 h-7" />
//             </span>
//             Credit Ledger
//           </h1>
//           <p className="text-sm text-slate-400 mt-1.5 font-medium">
//             Track outstanding balances and customer debt across active accounts.
//           </p>
//         </div>
//       </div>

//       {/* TABS & CONTROLS */}
//       <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800">
//         <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
//           {(['active', 'history', 'settlements'] as const).map((tab) => (
//             <button
//               key={tab}
//               onClick={() => setActiveTab(tab)}
//               className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
//                 activeTab === tab
//                   ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
//                   : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
//               }`}
//             >
//               {tab === 'active' && <Wallet className="w-4 h-4" />}
//               {tab}
//             </button>
//           ))}
//         </div>

//         {/* Search Bar & Export Button */}
//         <div className="flex items-center gap-3">
//           <div className="relative flex-1 md:w-80">
//             <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
//             <input
//               type="text"
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               placeholder="Search name or mobile..."
//               className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition"
//             />
//           </div>
//           <button 
//             onClick={handleExportCSV}
//             className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/20 px-4 py-2.5 rounded-xl text-xs font-bold transition"
//           >
//             <Download className="w-4 h-4" /> EXPORT
//           </button>
//         </div>
//       </div>

//       {/* METRIC CARDS */}
//       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//         <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg">
//           <div>
//             <span className="text-xs font-bold tracking-wider uppercase text-slate-400">Total Amount ({activeTab})</span>
//             <div className="text-3xl font-black text-slate-100 mt-1 font-mono">
//               Rs. {totalDebt.toLocaleString()}
//             </div>
//           </div>
//           <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-500">
//             <TrendingUp className="w-6 h-6" />
//           </div>
//         </div>

//         <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg">
//           <div>
//             <span className="text-xs font-bold tracking-wider uppercase text-slate-400">Total Credit Orders</span>
//             <div className="text-3xl font-black text-slate-100 mt-1 font-mono">
//               {totalActiveOrders}
//             </div>
//           </div>
//           <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
//             <Receipt className="w-6 h-6" />
//           </div>
//         </div>
//       </div>

//       {/* CUSTOMER BALANCES LIST */}
//       <div className="space-y-4">
//         <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
//           <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
//             Customer Balances ({filteredCustomers.length})
//           </h2>
//         </div>

//         {loading ? (
//           <div className="text-center text-slate-500 py-12">Loading credit records...</div>
//         ) : filteredCustomers.length === 0 ? (
//           <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
//             No credit entries found for this tab.
//           </div>
//         ) : (
//           <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
//             {filteredCustomers.map((customer) => (
//               <div
//                 key={customer.id}
//                 className="bg-slate-900 border border-slate-800/90 hover:border-amber-500/40 p-5 rounded-2xl transition-all shadow-sm hover:shadow-md flex items-center justify-between group"
//               >
//                 <div className="flex items-center gap-4">
//                   <div className="w-12 h-12 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-amber-400 transition">
//                     <User className="w-6 h-6" />
//                   </div>
//                   <div>
//                     <h3 className="font-bold text-base text-slate-100 group-hover:text-amber-400 transition">
//                       {customer.name}
//                     </h3>
                    
//                     <div className="flex items-center gap-2 mt-1">
//                       <span className="font-mono text-xs text-amber-500 font-semibold">{customer.phone}</span>
//                       {customer.phone !== 'N/A' && (
//                         <>
//                           <a
//                             href={`tel:${customer.phone}`}
//                             className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-400 transition"
//                             title="Call Customer"
//                           >
//                             <Phone className="w-3 h-3" />
//                           </a>
//                           <a
//                             href={`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}`}
//                             target="_blank"
//                             rel="noreferrer"
//                             className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 transition"
//                             title="Message Customer"
//                           >
//                             <MessageSquare className="w-3 h-3" />
//                           </a>
//                         </>
//                       )}
//                     </div>

//                     <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 mt-2">
//                       <Receipt className="w-3 h-3 text-slate-500" />
//                       <span>{customer.ordersCount} ORDERS</span>
//                     </div>
//                   </div>
//                 </div>

//                 <div className="text-right flex items-center gap-3">
//                   <div>
//                     <div className="text-lg font-black text-slate-100 font-mono">
//                       Rs. {customer.debtOwed.toLocaleString()}
//                     </div>
//                     {/* STATUS TAG (Paid / Unsettled) */}
//                     {customer.isFullySettled ? (
//                       <span className="text-[10px] font-bold text-emerald-400 tracking-wider uppercase block mt-0.5 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
//                         Settled / Paid
//                       </span>
//                     ) : (
//                       <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase block mt-0.5 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
//                         Unsettled / Debt
//                       </span>
//                     )}
//                   </div>

//                   {/* SETTLE / MARK PAID BUTTON (Only on Active Tab) */}
//                   {activeTab === 'active' && !customer.isFullySettled && (
//                     <button
//                       onClick={() => handleSettleCustomerDebt(customer)}
//                       className="p-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-400 hover:text-white transition flex items-center justify-center"
//                       title="Mark Balance as Paid"
//                     >
//                       <CheckCircle2 className="w-5 h-5" />
//                     </button>
//                   )}

//                   <button
//                     className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-slate-400 hover:text-amber-400 transition"
//                     title="View Ledger Details"
//                   >
//                     <ArrowUpRight className="w-4 h-4" />
//                   </button>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };


import { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, Search, Download, TrendingUp, Receipt, Phone, 
  MessageSquare, User, CheckCircle2, Edit2, X, MinusCircle,
  Eye, Trash2, Calendar, FileText
} from 'lucide-react';
import { posApi, type CreditCustomer } from '../api/posApi';

export const CreditLedgerPage = () => {
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'settlements'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal & Editing States
  const [selectedCustomer, setSelectedCustomer] = useState<CreditCustomer | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', phone: '', debtOwed: 0 });

  // Partial Payment State
  const [partialPaymentAmount, setPartialPaymentAmount] = useState<number | ''>('');
  const [paymentNote, setPaymentNote] = useState<string>('');

  // Fetch Credit Ledger directly from MongoDB backend
  const fetchCreditLedger = async () => {
    try {
      setLoading(true);
      const data = await posApi.getCreditLedger();
      setCustomers(data || []);
    } catch (err) {
      console.error('Failed to load credit ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreditLedger();
  }, []);

  // Settle all credit debt for a customer permanently in MongoDB
  const handleSettleCustomerDebt = async (customer: CreditCustomer) => {
    const formattedAmount = Number(customer.debtOwed.toFixed(2)).toLocaleString();
    if (!window.confirm(`Mark Rs. ${formattedAmount} as FULLY PAID for ${customer.name}?`)) return;

    try {
      setLoading(true);
      await posApi.fullSettleCredit(customer.phone, customer.name);
      alert(`Credit balance fully settled for ${customer.name}!`);
      if (isEditModalOpen) setIsEditModalOpen(false);
      await fetchCreditLedger();
    } catch (err) {
      console.error('Failed to settle credit debt:', err);
      alert('Failed to settle credit balance.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Customer Credit Record with Confirmation
  const handleDeleteCustomerCredit = async (customer: CreditCustomer) => {
    const firstConfirm = window.confirm(`Are you sure you want to delete the credit ledger entry for "${customer.name}"?`);
    if (!firstConfirm) return;

    try {
      setLoading(true);
      await Promise.all(customer.orderIds.map((id) => posApi.deleteOrder(id)));
      alert(`Credit entry for ${customer.name} deleted successfully.`);
      if (isEditModalOpen) setIsEditModalOpen(false);
      if (isHistoryModalOpen) setIsHistoryModalOpen(false);
      await fetchCreditLedger();
    } catch (err) {
      console.error('Failed to delete customer credit:', err);
      alert('Failed to delete credit entry.');
    } finally {
      setLoading(false);
    }
  };

  // Open Edit Modal (Active Tab)
  const handleOpenEditModal = (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setEditFormData({
      name: customer.name,
      phone: customer.phone,
      debtOwed: Number(customer.debtOwed.toFixed(2)),
    });
    setPartialPaymentAmount('');
    setPaymentNote('');
    setIsEditModalOpen(true);
  };

  // Open Detailed History Modal (History / Settlements Tab)
  const handleOpenHistoryModal = (customer: CreditCustomer) => {
    setSelectedCustomer(customer);
    setIsHistoryModalOpen(true);
  };

  // Handle Partial Payment deduction and persist to MongoDB
  const handlePartialSettle = async () => {
    if (!selectedCustomer) return;
    const payment = Number(partialPaymentAmount);

    if (!payment || payment <= 0) {
      return alert('Please enter a valid payment amount greater than 0.');
    }

    if (payment > editFormData.debtOwed + 0.01) {
      return alert('Payment amount cannot exceed the remaining debt owed.');
    }

    try {
      setLoading(true);
      await posApi.partialCreditPayment(
        selectedCustomer.phone,
        selectedCustomer.name,
        payment,
        paymentNote
      );

      const remainingAfter = Math.max(0, editFormData.debtOwed - payment);
      if (remainingAfter <= 0) {
        alert(`Account for ${selectedCustomer.name} is now FULLY SETTLED!`);
      } else {
        alert(`Successfully deducted Rs. ${payment.toLocaleString()} from ${selectedCustomer.name}'s balance.`);
      }

      setIsEditModalOpen(false);
      await fetchCreditLedger();
    } catch (err) {
      console.error('Failed to apply partial payment:', err);
      alert('Failed to process payment deduction.');
    } finally {
      setLoading(false);
    }
  };

  // Tab-specific Customer Ledger Filter logic
  const customerLedger = useMemo(() => {
    return customers.filter((c) => {
      const isBalanceZero = Number(c.debtOwed.toFixed(2)) <= 0;
      const isCleared = c.isFullySettled || isBalanceZero;
      const hasLogs = c.notesHistory && c.notesHistory.length > 0;

      if (activeTab === 'active') {
        // ACTIVE TAB: Only show records that still owe money and aren't fully settled
        return !isCleared && c.debtOwed > 0;
      }
      if (activeTab === 'settlements') {
        // SETTLEMENTS TAB: Show accounts that are fully settled or partially settled with payment logs
        return isCleared || hasLogs;
      }
      // HISTORY TAB: Displays everything
      return true;
    });
  }, [customers, activeTab]);

  // Filter customers matching search input
  const filteredCustomers = useMemo(() => {
    return customerLedger.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery)
    );
  }, [customerLedger, searchQuery]);

  // Metric aggregates
  const totalDebt = useMemo(() => customerLedger.reduce((sum, c) => sum + c.debtOwed, 0), [customerLedger]);
  const totalActiveOrders = useMemo(() => customerLedger.reduce((sum, c) => sum + c.ordersCount, 0), [customerLedger]);

  // CSV Export Functionality
  const handleExportCSV = () => {
    if (filteredCustomers.length === 0) return alert('No data available to export');

    const headers = ['Customer Name', 'Phone', 'Orders Count', 'Remaining Debt (Rs)', 'Status'];
    const rows = filteredCustomers.map((c) => [
      `"${c.name}"`,
      `"${c.phone}"`,
      c.ordersCount,
      Number(c.debtOwed.toFixed(2)),
      (c.isFullySettled || c.debtOwed <= 0) ? 'Fully Settled' : c.notesHistory.length > 0 ? 'Partially Settled' : 'Unsettled',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `credit_ledger_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 bg-slate-950 text-slate-100 min-h-screen space-y-8">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3 text-white tracking-tight">
            <span className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl">
              <Wallet className="w-7 h-7" />
            </span>
            Credit Ledger
          </h1>
          <p className="text-sm text-slate-400 mt-1.5 font-medium">
            Track outstanding balances, payment histories, and settlements.
          </p>
        </div>
      </div>

      {/* TABS & CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          {(['active', 'history', 'settlements'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                activeTab === tab
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {tab === 'active' && <Wallet className="w-4 h-4" />}
              {tab === 'history' && <FileText className="w-4 h-4" />}
              {tab === 'settlements' && <CheckCircle2 className="w-4 h-4" />}
              {tab}
            </button>
          ))}
        </div>

        {/* Search Bar & Export Button */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or mobile..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition"
            />
          </div>
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/20 px-4 py-2.5 rounded-xl text-xs font-bold transition"
          >
            <Download className="w-4 h-4" /> EXPORT
          </button>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-bold tracking-wider uppercase text-slate-400">Total Balance ({activeTab})</span>
            <div className="text-3xl font-black text-slate-100 mt-1 font-mono">
              Rs. {Number(totalDebt.toFixed(2)).toLocaleString()}
            </div>
          </div>
          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-500">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs font-bold tracking-wider uppercase text-slate-400">Total Credit Orders</span>
            <div className="text-3xl font-black text-slate-100 mt-1 font-mono">
              {totalActiveOrders}
            </div>
          </div>
          <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
            <Receipt className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* CUSTOMER BALANCES LIST */}
      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Customer Entries ({filteredCustomers.length})
          </h2>
        </div>

        {loading ? (
          <div className="text-center text-slate-500 py-12">Loading credit records...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
            No credit entries found for this section.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredCustomers.map((customer) => {
              const isCleared = customer.isFullySettled || Number(customer.debtOwed.toFixed(2)) <= 0;
              const isPartiallySettled = !isCleared && customer.notesHistory.length > 0;

              return (
                <div
                  key={customer.id}
                  className="bg-slate-900 border border-slate-800/90 hover:border-amber-500/40 p-4 rounded-2xl transition-all shadow-sm hover:shadow-md flex items-center justify-between gap-2 overflow-hidden group"
                >
                  {/* Left: Avatar + Details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 shrink-0 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-amber-400 transition">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-100 group-hover:text-amber-400 transition truncate">
                        {customer.name}
                      </h3>

                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-xs text-amber-500 font-semibold truncate">{customer.phone}</span>
                        {customer.phone !== 'N/A' && (
                          <>
                            <a
                              href={`tel:${customer.phone}`}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-400 transition shrink-0"
                              title="Call Customer"
                            >
                              <Phone className="w-3 h-3" />
                            </a>
                            <a
                              href={`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 transition shrink-0"
                              title="Message Customer"
                            >
                              <MessageSquare className="w-3 h-3" />
                            </a>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400 mt-1">
                        <Receipt className="w-3 h-3 text-slate-500" />
                        <span>{customer.ordersCount} ORDERS</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Balance + Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    <div className="text-right">
                      <div className="text-sm sm:text-base font-black text-slate-100 font-mono">
                        Rs.{Number(customer.debtOwed.toFixed(2)).toLocaleString()}
                      </div>

                      {/* BADGES */}
                      {isCleared ? (
                        <span className="text-[9px] font-bold text-emerald-400 tracking-wider uppercase block mt-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          Fully Settled
                        </span>
                      ) : isPartiallySettled ? (
                        <span className="text-[9px] font-bold text-amber-400 tracking-wider uppercase block mt-0.5 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                          Partially Settled
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold text-red-400 tracking-wider uppercase block mt-0.5 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                          Unsettled
                        </span>
                      )}
                    </div>

                    {/* ACTIONS */}
                    <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
                      {activeTab === 'active' && (
                        <>
                          {!isCleared && (
                            <button
                              onClick={() => handleSettleCustomerDebt(customer)}
                              className="p-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-400 hover:text-white transition flex items-center justify-center"
                              title="Mark Balance as Fully Paid"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditModal(customer)}
                            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/50 text-slate-400 hover:text-amber-400 transition"
                            title="Edit Customer / Receive Partial Payment"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {(activeTab === 'history' || activeTab === 'settlements') && (
                        <button
                          onClick={() => handleOpenHistoryModal(customer)}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/50 text-slate-400 hover:text-amber-400 transition"
                          title="View Detailed Credit History"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteCustomerCredit(customer)}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-red-500/50 text-slate-400 hover:text-red-400 transition"
                        title="Delete Credit Entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* HISTORY MODAL */}
      {isHistoryModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Credit History & Logs</h2>
                  <p className="text-xs text-slate-400">Detailed record of payments and settlement dates</p>
                </div>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">{selectedCustomer.name}</h3>
                  <p className="text-xs font-mono text-amber-500 mt-0.5">{selectedCustomer.phone}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Current Balance</span>
                  <p className="text-base font-black text-slate-100 font-mono">
                    Rs. {Number(selectedCustomer.debtOwed.toFixed(2)).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900 text-xs text-slate-400">
                <div>Total Credit Orders: <strong className="text-slate-200">{selectedCustomer.ordersCount}</strong></div>
                <div>
                  Status:{' '}
                  <strong className={(selectedCustomer.isFullySettled || selectedCustomer.debtOwed <= 0) ? 'text-emerald-400' : 'text-amber-400'}>
                    {(selectedCustomer.isFullySettled || selectedCustomer.debtOwed <= 0) ? 'Fully Settled' : selectedCustomer.notesHistory.length > 0 ? 'Partially Settled' : 'Active Debt'}
                  </strong>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-amber-500" /> Payment & Settlement Timeline
              </h4>

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {selectedCustomer.notesHistory && selectedCustomer.notesHistory.length > 0 ? (
                  selectedCustomer.notesHistory.map((note, index) => (
                    <div key={index} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-300 font-medium">
                        <span>{note}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center text-xs text-slate-500">
                    No payment dates recorded for this account.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT & PARTIAL SETTLEMENT MODAL */}
      {isEditModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-xl">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Manage & Settle Credit Ledger</h2>
                  <p className="text-xs text-slate-400">Deduct partial payments or update profile details</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Customer Name</label>
                <input
                  type="text"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500/50 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500/50 transition font-mono"
                />
              </div>
            </div>

            {selectedCustomer.debtOwed > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <MinusCircle className="w-4 h-4" /> Receive Partial Payment
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Current Owed: <strong className="text-slate-200">Rs. {Number(editFormData.debtOwed.toFixed(2)).toLocaleString()}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Payment Amount (Rs)</label>
                    <input
                      type="number"
                      placeholder="e.g. 500"
                      value={partialPaymentAmount}
                      onChange={(e) => setPartialPaymentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-amber-500/50 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">Remarks / Note</label>
                    <input
                      type="text"
                      placeholder="e.g. Paid in cash"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/50 transition"
                    />
                  </div>
                </div>

                {typeof partialPaymentAmount === 'number' && partialPaymentAmount > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-amber-500/10 text-xs">
                    <span className="text-slate-400">Remaining Balance After Payment:</span>
                    <span className="font-mono font-bold text-amber-400">
                      Rs. {Math.max(0, Number((editFormData.debtOwed - partialPaymentAmount).toFixed(2))).toLocaleString()}
                    </span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handlePartialSettle}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
                >
                  Deduct & Log Payment
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              {selectedCustomer.debtOwed > 0 && (
                <button
                  type="button"
                  onClick={() => handleSettleCustomerDebt(selectedCustomer)}
                  className="flex items-center gap-2 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition"
                >
                  <CheckCircle2 className="w-4 h-4" /> Full Settlement
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};