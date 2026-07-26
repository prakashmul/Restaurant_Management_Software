import { useState, useEffect } from 'react';
import { Package, PlusCircle, RefreshCw, History, User, FileText, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { posApi } from '../api/posApi';
import type { InventoryItem } from '../types';

// Define type for history log items
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
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<StockHistoryLog[]>([]);

  // Local state for each row's adjustment inputs
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
      // Fetch history if implemented in API; falls back gracefully
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
    loadHistory();
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleRestock = async (item: InventoryItem) => {
    const itemId = item._id || item.id || '';
    if (!itemId) return;

    const qtyStr = restockAmount[itemId]?.trim();
    const by = performedBy[itemId]?.trim();
    const desc = description[itemId]?.trim();

    // Validate that all fields are filled out
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
      // Pass qty, performedBy, and description to API
      await posApi.restockItem(itemId, qty, { performedBy: by, description: desc });

      // Clear input fields for this item
      setRestockAmount((prev) => ({ ...prev, [itemId]: '' }));
      setPerformedBy((prev) => ({ ...prev, [itemId]: '' }));
      setDescription((prev) => ({ ...prev, [itemId]: '' }));

      // Refresh table and history
      await loadAllData();

      const action = qty < 0 ? 'deducted' : 'added';
      alert(`Stock ${action} successfully!`);
    } catch (err) {
      alert('Failed to update stock');
    }
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
        <button
          onClick={loadAllData}
          className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-xl transition text-slate-300"
          title="Refresh Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
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
                        {/* Quantity Input */}
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

                        {/* Performed By Input */}
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

                        {/* Reason / Description Input */}
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

                        {/* Submit Button */}
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

      {/* History Log Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            Stock Movement History Log
          </h2>
          <span className="text-xs text-slate-500">
            {history.length} {history.length === 1 ? 'entry' : 'entries'} logged
          </span>
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
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                    No stock movement history recorded yet.
                  </td>
                </tr>
              ) : (
                history.map((log, index) => {
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
    </div>
  );
};