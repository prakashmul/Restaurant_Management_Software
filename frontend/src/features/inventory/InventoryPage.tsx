import { useState, useEffect, useRef } from 'react';
import { Package, PlusCircle, History, FileText, ArrowUpRight, ArrowDownRight, X, Printer, Calendar, AlertTriangle, Bell, Check, Trash2, Receipt, RefreshCw } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { PriceHistoryEntry, Vendor } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import type { InventoryItem } from '../../types';

type StockHistoryLog = {
  _id?: string;
  id?: string;
  itemId?: string;
  itemName: string;
  quantity: number;
  unit: string;
  performedBy: string;
  description: string;
  createdAt: string;
};

export const InventoryPage = () => {
  const { isOwner, currentLocation, currentUser } = useAuth();
  const performedByName = currentUser?.name || 'Unknown';

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<StockHistoryLog[]>([]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [newInitialStock, setNewInitialStock] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newCostPerUnit, setNewCostPerUnit] = useState('');
  const [newLowStockThreshold, setNewLowStockThreshold] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const [thresholdEdits, setThresholdEdits] = useState<{ [key: string]: string }>({});
  const [savingThreshold, setSavingThreshold] = useState<string | null>(null);

  const [wasteModalItem, setWasteModalItem] = useState<InventoryItem | null>(null);
  const [wasteQuantity, setWasteQuantity] = useState('');
  const [wasteReason, setWasteReason] = useState<'spoilage' | 'breakage' | 'staff-meal' | 'other'>('spoilage');
  const [wasteDescription, setWasteDescription] = useState('');
  const [isLoggingWaste, setIsLoggingWaste] = useState(false);

  const [priceHistoryItem, setPriceHistoryItem] = useState<InventoryItem | null>(null);
  const [priceHistoryEntries, setPriceHistoryEntries] = useState<PriceHistoryEntry[]>([]);
  const [isLoadingPriceHistory, setIsLoadingPriceHistory] = useState(false);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [reorderModalItem, setReorderModalItem] = useState<InventoryItem | null>(null);
  const [reorderVendorId, setReorderVendorId] = useState('');
  const [reorderQty, setReorderQty] = useState('');
  const [reorderBarcode, setReorderBarcode] = useState('');
  const [isSavingReorder, setIsSavingReorder] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);

  const [restockAmount, setRestockAmount] = useState<{ [key: string]: string }>({});
  const [description, setDescription] = useState<{ [key: string]: string }>({});

  const loadInventory = async () => {
    try {
      const data = await posApi.getInventory();
      setInventory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    }
  };

  const loadHistory = async () => {
    try {
      if (posApi.getStockHistory) {
        const historyData = await posApi.getStockHistory();
        setHistory(Array.isArray(historyData) ? historyData : []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const loadVendors = async () => {
    try {
      const data = await posApi.getVendors();
      setVendors(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load vendors:', err);
    }
  };

  const loadAllData = () => {
    loadInventory();
    loadVendors();
    if (isOwner) {
      loadHistory();
    }
  };

  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, currentLocation?.id]);

  useRealtimeRefresh(['inventory'], loadAllData);

  const handleRestock = async (item: InventoryItem) => {
    const itemId = item._id || item.id || '';
    if (!itemId) return;

    const qtyStr = restockAmount[itemId]?.trim();
    const desc = description[itemId]?.trim();

    if (!qtyStr || !desc) {
      alert('Please fill out all fields: Quantity and Reason/Note.');
      return;
    }

    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty === 0) {
      alert('Please enter a valid non-zero amount.');
      return;
    }

    try {
      await posApi.restockItem(itemId, qty, { performedBy: performedByName, description: desc });

      setRestockAmount((prev) => ({ ...prev, [itemId]: '' }));
      setDescription((prev) => ({ ...prev, [itemId]: '' }));

      await loadAllData();

      const action = qty < 0 ? 'deducted' : 'added';
      alert(`Stock ${action} successfully!`);
    } catch (err) {
      alert('Failed to update stock');
    }
  };

  const handleAddIngredient = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newIngredientName.trim() || !newInitialStock.trim() || !newUnit.trim() || !newDescription.trim()) {
      alert('Please fill out all required fields.');
      return;
    }

    const qty = parseFloat(newInitialStock);
    const cost = newCostPerUnit ? parseFloat(newCostPerUnit) : 0;
    const threshold = newLowStockThreshold ? parseFloat(newLowStockThreshold) : 0;

    if (isNaN(qty)) {
      alert('Please enter a valid initial stock quantity.');
      return;
    }

    try {
      if (posApi.createInventoryItem) {
        await posApi.createInventoryItem({
          name: newIngredientName.trim(),
          totalQuantity: qty,
          unit: newUnit.trim(),
          costPerUnit: cost,
          lowStockThreshold: threshold,
          performedBy: performedByName,
          description: newDescription.trim(),
        });
      } else {
        throw new Error('createInventoryItem API method not implemented.');
      }

      setNewIngredientName('');
      setNewInitialStock('');
      setNewUnit('');
      setNewCostPerUnit('');
      setNewLowStockThreshold('');
      setNewDescription('');
      setIsAddModalOpen(false);

      loadAllData();
      alert('New ingredient added successfully!');
    } catch (err) {
      console.error('Failed to create inventory item:', err);
      alert('Failed to add new ingredient.');
    }
  };

  const handleSaveThreshold = async (item: InventoryItem) => {
    const itemId = item._id || item.id || '';
    if (!itemId) return;

    const raw = thresholdEdits[itemId];
    const value = raw === undefined ? item.lowStockThreshold || 0 : parseFloat(raw);
    if (isNaN(value) || value < 0) {
      alert('Please enter a valid non-negative threshold.');
      return;
    }

    try {
      setSavingThreshold(itemId);
      await posApi.updateInventoryItem(itemId, { lowStockThreshold: value });
      setThresholdEdits((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      await loadInventory();
    } catch (err) {
      alert('Failed to update low-stock threshold.');
    } finally {
      setSavingThreshold(null);
    }
  };

  const openWasteModal = (item: InventoryItem) => {
    setWasteModalItem(item);
    setWasteQuantity('');
    setWasteReason('spoilage');
    setWasteDescription('');
  };

  const handleLogWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteModalItem) return;
    const itemId = wasteModalItem._id || wasteModalItem.id || '';
    if (!itemId) return;

    const qty = parseFloat(wasteQuantity);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid amount wasted, greater than 0.');
      return;
    }
    try {
      setIsLoggingWaste(true);
      await posApi.logWaste(itemId, qty, wasteReason, {
        performedBy: performedByName,
        description: wasteDescription.trim(),
      });
      setWasteModalItem(null);
      await loadAllData();
    } catch (err) {
      alert('Failed to log waste.');
    } finally {
      setIsLoggingWaste(false);
    }
  };

  const openPriceHistory = async (item: InventoryItem) => {
    const itemId = item._id || item.id || '';
    if (!itemId) return;
    setPriceHistoryItem(item);
    setPriceHistoryEntries([]);
    setIsLoadingPriceHistory(true);
    try {
      const data = await posApi.getPriceHistory(itemId);
      setPriceHistoryEntries(data);
    } catch (err) {
      console.error('Failed to load price history:', err);
    } finally {
      setIsLoadingPriceHistory(false);
    }
  };

  const openReorderModal = (item: InventoryItem) => {
    setReorderModalItem(item);
    setReorderVendorId(item.preferredVendorId || '');
    setReorderQty(item.reorderQuantity ? String(item.reorderQuantity) : '');
    setReorderBarcode(item.barcode || '');
  };

  const handleSaveReorder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reorderModalItem) return;
    const itemId = reorderModalItem._id || reorderModalItem.id || '';
    if (!itemId) return;

    try {
      setIsSavingReorder(true);
      await posApi.updateInventoryItem(itemId, {
        preferredVendorId: reorderVendorId || null,
        reorderQuantity: reorderQty ? Number(reorderQty) : 0,
        barcode: reorderBarcode.trim() || null,
      });
      setReorderModalItem(null);
      await loadInventory();
    } catch (err) {
      alert('Failed to save auto-reorder settings.');
    } finally {
      setIsSavingReorder(false);
    }
  };

  // Filtered History Logic
  const filteredHistory = history.filter((log) => {
    if (!log.createdAt) return true;
    
    const d = new Date(log.createdAt);
    if (isNaN(d.getTime())) return true;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const logDateStr = `${year}-${month}-${day}`;

    if (startDate && logDateStr < startDate) return false;
    if (endDate && logDateStr > endDate) return false;
    
    return true;
  });

  // Print / Save PDF Handler
  const handlePrintOrSavePDF = () => {
    const printStyle = document.createElement('style');
    printStyle.id = 'print-style';
    printStyle.innerHTML = `
      @media print {
        body * {
          visibility: hidden !important;
        }
        #printable-history-log, #printable-history-log * {
          visibility: visible !important;
        }
        #printable-history-log {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          background: white !important;
          color: black !important;
        }
        #print-button-container {
          display: none !important;
        }
      }
    `;
    document.head.appendChild(printStyle);
    window.print();
    document.head.removeChild(printStyle);
  };

  return (
    <div className="p-6 space-y-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-400" />
            Kitchen & Bar Inventory
          </h1>
          <p className="text-xs text-slate-400">
            Real-time raw ingredient tracking, adjustments & audit logging
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold text-sm transition text-white shadow-lg"
          >
            <PlusCircle className="w-4 h-4" />
            Add Ingredient
          </button>
        </div>
      </div>

      {/* Raw Stock Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 font-semibold text-slate-300 text-sm">
          Current Stock Levels & Adjustments
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 uppercase text-[11px] text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-4">Ingredient Name</th>
                <th className="p-4">Stock Level</th>
                <th className="p-4">Unit Cost</th>
                <th className="p-4">Low Stock Alert</th>
                <th className="p-4 text-right">Adjust Stock (+ / -)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {inventory.map((item) => {
                const itemId = item._id || item.id || '';
                const lowStock = !!item.isLowStock;
                return (
                  <tr key={itemId} className={`transition ${lowStock ? 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08]' : 'hover:bg-slate-800/40'}`}>
                    <td className="p-4 font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        {item.name}
                        {lowStock && (
                          <span
                            title={`Below the ${item.lowStockThreshold} ${item.unit} alert threshold`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Low
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-xs font-semibold ${
                          lowStock
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {(item.totalQuantity || 0).toFixed(2)} {item.unit}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-slate-400">
                      ${(item.costPerUnit || 0).toFixed(2)} / {item.unit}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="Off"
                          value={
                            itemId
                              ? thresholdEdits[itemId] !== undefined
                                ? thresholdEdits[itemId]
                                : String(item.lowStockThreshold || 0)
                              : ''
                          }
                          onChange={(e) => {
                            if (itemId) setThresholdEdits({ ...thresholdEdits, [itemId]: e.target.value });
                          }}
                          className="w-16 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                        <span className="text-[10px] text-slate-500">{item.unit}</span>
                        {itemId && thresholdEdits[itemId] !== undefined && (
                          <button
                            onClick={() => handleSaveThreshold(item)}
                            disabled={savingThreshold === itemId}
                            title="Save threshold"
                            className="text-emerald-400 hover:text-emerald-300 p-2 sm:p-1 rounded-lg hover:bg-emerald-500/10 transition disabled:opacity-40"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="inline-flex flex-wrap sm:flex-nowrap items-center justify-end gap-2">
                        <input
                          type="number"
                          step="any"
                          required
                          placeholder={`Qty (${item.unit}) *`}
                          value={itemId ? restockAmount[itemId] || '' : ''}
                          onChange={(e) => {
                            if (itemId) {
                              setRestockAmount({ ...restockAmount, [itemId]: e.target.value });
                            }
                          }}
                          className="w-24 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                        <div className="relative">
                          <FileText className="w-3.5 h-3.5 absolute left-2 top-2.5 text-slate-500" />
                          <input
                            type="text"
                            required
                            placeholder="Remarks *"
                            value={itemId ? description[itemId] || '' : ''}
                            onChange={(e) => {
                              if (itemId) {
                                setDescription({ ...description, [itemId]: e.target.value });
                              }
                            }}
                            className="w-36 pl-7 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <button
                          onClick={() => handleRestock(item)}
                          disabled={!itemId}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 sm:p-1.5 rounded-lg transition disabled:opacity-40"
                          title="Save Stock Adjustment"
                        >
                          <PlusCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openWasteModal(item)}
                          disabled={!itemId}
                          className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 p-2.5 sm:p-1.5 rounded-lg transition disabled:opacity-40"
                          title="Log Waste"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openPriceHistory(item)}
                          disabled={!itemId}
                          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 p-2.5 sm:p-1.5 rounded-lg transition disabled:opacity-40"
                          title="Supplier Price History"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openReorderModal(item)}
                          disabled={!itemId}
                          className={`p-2.5 sm:p-1.5 rounded-lg transition disabled:opacity-40 border ${
                            item.preferredVendorId
                              ? 'bg-indigo-500/10 hover:bg-indigo-500/20 border-indigo-500/20 text-indigo-400'
                              : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                          }`}
                          title="Auto-Reorder Settings"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* STOCK MOVEMENT HISTORY LOG - OWNER ONLY                  */}
      {/* ========================================================= */}
      {isOwner && (
        <div id="printable-history-log" ref={historyRef} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-semibold text-slate-200">Stock Movement History Log</h2>
            </div>
            
            {/* Main Bar Filter Controls & Print Button */}
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] text-slate-400">Filter:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-[11px] text-slate-200 focus:outline-none"
                />
                <span className="text-[11px] text-slate-600">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-[11px] text-slate-200 focus:outline-none"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="text-[10px] text-indigo-400 hover:underline ml-1"
                  >
                    Clear
                  </button>
                )}
              </div>

              <span className="text-xs text-slate-500">
                {filteredHistory.length} {filteredHistory.length === 1 ? 'entry' : 'entries'}
              </span>

              {/* Direct Print / Save as PDF Button */}
              <div id="print-button-container">
                <button
                  onClick={handlePrintOrSavePDF}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/60 uppercase text-[11px] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-4">Date & Time</th>
                  <th className="p-4">Item</th>
                  <th className="p-4">Adjustment</th>
                  <th className="p-4">Performed By</th>
                  <th className="p-4">Reason / Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                      No stock movement history found for the selected range.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((log, index) => {
                    const isAddition = log.quantity > 0;
                    return (
                      <tr key={log._id || log.id || index} className="hover:bg-slate-800/40 transition">
                        <td className="p-4 text-xs font-mono text-slate-400 whitespace-nowrap">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : 'N/A'}
                        </td>
                        <td className="p-4 font-semibold text-slate-200">{log.itemName}</td>
                        <td className="p-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              isAddition
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {isAddition ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            {isAddition ? `+${log.quantity}` : log.quantity} {log.unit}
                          </span>
                        </td>
                        <td className="p-4 text-slate-300 font-medium">
                          {log.performedBy || 'Anonymous'}
                        </td>
                        <td className="p-4 text-slate-400 text-xs italic">
                          {log.description || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Ingredient Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 bg-slate-950/40 border-b border-slate-800">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-400" />
                Add New Inventory Ingredient
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddIngredient} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Ingredient Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Olive Oil"
                  value={newIngredientName}
                  onChange={(e) => setNewIngredientName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Initial Stock *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 10"
                    value={newInitialStock}
                    onChange={(e) => setNewInitialStock(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Unit *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. L, kg, pcs"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Unit Cost ($)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 5.50"
                    value={newCostPerUnit}
                    onChange={(e) => setNewCostPerUnit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Low Stock Alert At</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 5 (off if blank)"
                    value={newLowStockThreshold}
                    onChange={(e) => setNewLowStockThreshold(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Reason / Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Initial stock creation"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-semibold transition text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold transition text-white shadow-lg"
                >
                  Save Ingredient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Waste Modal */}
      {wasteModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 bg-slate-950/40 border-b border-slate-800">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-400" />
                Log Waste — {wasteModalItem.name}
              </h3>
              <button
                onClick={() => setWasteModalItem(null)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleLogWaste} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Amount Wasted ({wasteModalItem.unit}) *</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="e.g. 2"
                  value={wasteQuantity}
                  onChange={(e) => setWasteQuantity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Reason *</label>
                <select
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value as typeof wasteReason)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                >
                  <option value="spoilage">Spoilage</option>
                  <option value="breakage">Breakage</option>
                  <option value="staff-meal">Staff Meal</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Left out overnight"
                  value={wasteDescription}
                  onChange={(e) => setWasteDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setWasteModalItem(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-semibold transition text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoggingWaste}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-sm font-semibold transition text-white shadow-lg disabled:opacity-50"
                >
                  {isLoggingWaste ? 'Logging…' : 'Log Waste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Price History Modal */}
      {priceHistoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center p-4 bg-slate-950/40 border-b border-slate-800 shrink-0">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-indigo-400" />
                Supplier Price History — {priceHistoryItem.name}
              </h3>
              <button
                onClick={() => setPriceHistoryItem(null)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              {isLoadingPriceHistory ? (
                <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
              ) : priceHistoryEntries.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm italic">
                  No received purchase orders for this ingredient yet.
                </div>
              ) : (
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="uppercase text-[10px] text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="pb-2 pr-3">Date</th>
                      <th className="pb-2 pr-3">Vendor</th>
                      <th className="pb-2 pr-3 text-right">Qty</th>
                      <th className="pb-2 text-right">Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {priceHistoryEntries.map((entry) => (
                      <tr key={entry.purchaseOrderId}>
                        <td className="py-2 pr-3 text-xs text-slate-400 whitespace-nowrap">
                          {entry.receivedAt ? new Date(entry.receivedAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2 pr-3 font-medium text-slate-200">{entry.vendorName}</td>
                        <td className="py-2 pr-3 text-right font-mono">
                          {entry.quantity} {priceHistoryItem.unit}
                        </td>
                        <td className="py-2 text-right font-mono text-emerald-400">
                          ${entry.unitCost.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto-Reorder Settings Modal */}
      {reorderModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-4 bg-slate-950/40 border-b border-slate-800">
              <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-400" />
                Reorder Settings — {reorderModalItem.name}
              </h3>
              <button
                onClick={() => setReorderModalItem(null)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveReorder} className="p-6 space-y-4">
              <p className="text-xs text-slate-400">
                When this ingredient runs low, it'll be suggested as a draft purchase order to the vendor below, for the quantity you set here. Leave the vendor unset to opt out.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Preferred Vendor</label>
                <select
                  value={reorderVendorId}
                  onChange={(e) => setReorderVendorId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Off (no suggestion)</option>
                  {vendors.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Reorder Quantity ({reorderModalItem.unit})</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="e.g. 20"
                  value={reorderQty}
                  onChange={(e) => setReorderQty(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Barcode (optional)</label>
                <input
                  type="text"
                  placeholder="Scan or type the product's barcode"
                  value={reorderBarcode}
                  onChange={(e) => setReorderBarcode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[10px] text-slate-500 mt-1">Lets Procurement's "Scan to receive" find this ingredient by camera.</p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReorderModalItem(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-semibold transition text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingReorder}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold transition text-white shadow-lg disabled:opacity-50"
                >
                  {isSavingReorder ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};