import { useState, useEffect, useRef } from 'react';
import { Package, PlusCircle, History, User, FileText, ArrowUpRight, ArrowDownRight, X, Printer, Calendar } from 'lucide-react';
import { posApi } from '../../api/posApi';
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
  const { isOwner, currentLocation } = useAuth();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<StockHistoryLog[]>([]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  const [newInitialStock, setNewInitialStock] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [newCostPerUnit, setNewCostPerUnit] = useState('');
  const [newPerformedBy, setNewPerformedBy] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);

  const [restockAmount, setRestockAmount] = useState<{ [key: string]: string }>({});
  const [performedBy, setPerformedBy] = useState<{ [key: string]: string }>({});
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

  const loadAllData = () => {
    loadInventory();
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
    const by = performedBy[itemId]?.trim();
    const desc = description[itemId]?.trim();

    if (!qtyStr || !by || !desc) {
      alert('Please fill out all fields: Quantity, Performed By, and Reason/Note.');
      return;
    }

    const qty = parseFloat(qtyStr);
    if (isNaN(qty) || qty === 0) {
      alert('Please enter a valid non-zero amount.');
      return;
    }

    try {
      await posApi.restockItem(itemId, qty, { performedBy: by, description: desc });

      setRestockAmount((prev) => ({ ...prev, [itemId]: '' }));
      setPerformedBy((prev) => ({ ...prev, [itemId]: '' }));
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

    if (!newIngredientName.trim() || !newInitialStock.trim() || !newUnit.trim() || !newPerformedBy.trim() || !newDescription.trim()) {
      alert('Please fill out all required fields.');
      return;
    }

    const qty = parseFloat(newInitialStock);
    const cost = newCostPerUnit ? parseFloat(newCostPerUnit) : 0;

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
          performedBy: newPerformedBy.trim(),
          description: newDescription.trim(),
        });
      } else {
        throw new Error('createInventoryItem API method not implemented.');
      }

      setNewIngredientName('');
      setNewInitialStock('');
      setNewUnit('');
      setNewCostPerUnit('');
      setNewPerformedBy('');
      setNewDescription('');
      setIsAddModalOpen(false);

      loadAllData();
      alert('New ingredient added successfully!');
    } catch (err) {
      console.error('Failed to create inventory item:', err);
      alert('Failed to add new ingredient.');
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
                <th className="p-4 text-right">Adjust Stock (+ / -)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {inventory.map((item) => {
                const itemId = item._id || item.id || '';
                return (
                  <tr key={itemId} className="hover:bg-slate-800/40 transition">
                    <td className="p-4 font-semibold text-slate-200">{item.name}</td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          (item.totalQuantity || 0) < 5
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
                          <User className="w-3.5 h-3.5 absolute left-2 top-2.5 text-slate-500" />
                          <input
                            type="text"
                            required
                            placeholder="By whom? *"
                            value={itemId ? performedBy[itemId] || '' : ''}
                            onChange={(e) => {
                              if (itemId) {
                                setPerformedBy({ ...performedBy, [itemId]: e.target.value });
                              }
                            }}
                            className="w-28 pl-7 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="relative">
                          <FileText className="w-3.5 h-3.5 absolute left-2 top-2.5 text-slate-500" />
                          <input
                            type="text"
                            required
                            placeholder="Reason / Note *"
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
                          className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded-lg transition disabled:opacity-40"
                          title="Save Stock Adjustment"
                        >
                          <PlusCircle className="w-4 h-4" />
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
                <label className="block text-xs font-medium text-slate-400 mb-1">Performed By *</label>
                <input
                  type="text"
                  required
                  placeholder="Your Name"
                  value={newPerformedBy}
                  onChange={(e) => setNewPerformedBy(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                />
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
    </div>
  );
};