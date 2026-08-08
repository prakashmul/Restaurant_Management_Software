import React, { useEffect, useMemo, useState } from 'react';
import { Truck, Store, Plus, X, Trash2, ArrowRight, Sparkles, ScanLine } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { Vendor, PurchaseOrder, PurchaseOrderStatus, SuggestedOrder } from '../../api/posApi';
import type { InventoryItem } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { BarcodeScannerModal } from './BarcodeScannerModal';

const STATUS_COLUMNS: { key: PurchaseOrderStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'received', label: 'Received' },
  { key: 'reconciled', label: 'Reconciled' },
];

const NEXT_STATUS: Record<PurchaseOrderStatus, PurchaseOrderStatus | null> = {
  draft: 'sent',
  sent: 'received',
  received: 'reconciled',
  reconciled: null,
};

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message || anyErr?.response?.data?.error || fallback;
}

export const ProcurementPage: React.FC = () => {
  const { isOwner, currentUser, currentLocation } = useAuth();
  const canManage = isOwner || currentUser?.role === 'Manager';

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedOrder[]>([]);
  const [draftingVendorId, setDraftingVendorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [vendorName, setVendorName] = useState('');
  const [vendorCategory, setVendorCategory] = useState('');
  const [vendorError, setVendorError] = useState('');

  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [poVendorId, setPoVendorId] = useState('');
  const [poLines, setPoLines] = useState<{ inventoryItemId: string; quantity: string; unitCost: string }[]>([
    { inventoryItemId: '', quantity: '', unitCost: '' },
  ]);
  const [poError, setPoError] = useState('');
  const [isSavingPo, setIsSavingPo] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState('');

  const loadAll = async () => {
    try {
      const [vendorData, poData, inventoryData, suggestedData] = await Promise.all([
        posApi.getVendors(),
        posApi.getPurchaseOrders(),
        posApi.getInventory(),
        posApi.getSuggestedOrders(),
      ]);
      setVendors(vendorData);
      setPurchaseOrders(poData);
      setInventory(inventoryData);
      setSuggestions(suggestedData);
    } catch (err) {
      console.error('Failed to load procurement data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation?.id]);

  useRealtimeRefresh(['purchaseOrder', 'inventory'], loadAll);

  const openPoCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const po of purchaseOrders) {
      if (po.status === 'draft' || po.status === 'sent') {
        counts.set(po.vendorId, (counts.get(po.vendorId) || 0) + 1);
      }
    }
    return counts;
  }, [purchaseOrders]);

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setVendorError('');
    if (!vendorName.trim() || !vendorCategory.trim()) {
      setVendorError('Name and category are required.');
      return;
    }
    try {
      await posApi.createVendor({ name: vendorName.trim(), category: vendorCategory.trim() });
      setVendorName('');
      setVendorCategory('');
      await loadAll();
    } catch (err) {
      setVendorError(extractErrorMessage(err, 'Failed to create vendor.'));
    }
  };

  const handleDeleteVendor = async (vendor: Vendor) => {
    if (!window.confirm(`Delete vendor "${vendor.name}"?`)) return;
    try {
      await posApi.deleteVendor(vendor._id);
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to delete vendor.'));
    }
  };

  const openPoModal = () => {
    setPoVendorId(vendors[0]?._id || '');
    setPoLines([{ inventoryItemId: inventory[0]?._id || inventory[0]?.id || '', quantity: '', unitCost: '' }]);
    setPoError('');
    setScanNotice('');
    setIsPoModalOpen(true);
  };

  const updateLine = (idx: number, field: 'inventoryItemId' | 'quantity' | 'unitCost', value: string) => {
    setPoLines((prev) => prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line)));
  };

  const handleBarcodeDetected = (code: string) => {
    setIsScannerOpen(false);
    const item = inventory.find((i) => i.barcode && i.barcode === code);
    if (!item) {
      setScanNotice(`No ingredient is tagged with barcode "${code}" yet — add it from the Inventory page first.`);
      return;
    }
    const itemId = item._id || item.id || '';
    setScanNotice(`Scanned: ${item.name}`);
    setPoLines((prev) => {
      const existingIdx = prev.findIndex((l) => l.inventoryItemId === itemId);
      if (existingIdx >= 0) {
        return prev.map((line, i) =>
          i === existingIdx ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) } : line
        );
      }
      const blankIdx = prev.findIndex((l) => !l.inventoryItemId);
      const newLine = { inventoryItemId: itemId, quantity: '1', unitCost: String(item.costPerUnit || '') };
      if (blankIdx >= 0) {
        return prev.map((line, i) => (i === blankIdx ? newLine : line));
      }
      return [...prev, newLine];
    });
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPoError('');

    if (!poVendorId) {
      setPoError('Pick a vendor.');
      return;
    }
    const items = poLines
      .filter((l) => l.inventoryItemId && l.quantity && l.unitCost)
      .map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) }));

    if (items.length === 0) {
      setPoError('Add at least one line item with a quantity and unit cost.');
      return;
    }

    try {
      setIsSavingPo(true);
      await posApi.createPurchaseOrder({ vendorId: poVendorId, items });
      setIsPoModalOpen(false);
      await loadAll();
    } catch (err) {
      setPoError(extractErrorMessage(err, 'Failed to create purchase order.'));
    } finally {
      setIsSavingPo(false);
    }
  };

  const handleAdvance = async (po: PurchaseOrder) => {
    const next = NEXT_STATUS[po.status];
    if (!next) return;
    const confirmMsg =
      next === 'received'
        ? `Mark this PO as received? This will add ${po.items.length} item(s) to inventory immediately.`
        : `Advance this purchase order to "${next}"?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await posApi.updatePurchaseOrderStatus(po._id, next);
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to update purchase order.'));
    }
  };

  const handleDraftSuggestion = async (suggestion: SuggestedOrder) => {
    try {
      setDraftingVendorId(suggestion.vendorId);
      await posApi.createPurchaseOrder({
        vendorId: suggestion.vendorId,
        items: suggestion.items.map((i) => ({
          inventoryItemId: i.inventoryItemId,
          quantity: i.reorderQuantity,
          unitCost: i.unitCost,
        })),
      });
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to draft purchase order.'));
    } finally {
      setDraftingVendorId(null);
    }
  };

  const handleDeletePo = async (po: PurchaseOrder) => {
    if (!window.confirm('Delete this draft purchase order?')) return;
    try {
      await posApi.deletePurchaseOrder(po._id);
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to delete purchase order.'));
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-400" /> Procurement &amp; Vendors
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Purchase orders feed straight into inventory the same way a manual restock does.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setIsVendorModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-bold rounded-xl transition"
            >
              <Store className="w-3.5 h-3.5" /> Manage vendors
            </button>
            <button
              onClick={openPoModal}
              disabled={vendors.length === 0 || inventory.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> New purchase order
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading procurement data…</div>
      ) : (
        <>
          {suggestions.length > 0 && (
            <div className="bg-amber-500/[0.04] border border-amber-500/20 rounded-2xl p-5">
              <h3 className="text-xs font-bold mb-1 flex items-center gap-1.5 text-amber-300">
                <Sparkles className="w-3.5 h-3.5" /> Suggested Purchase Orders
              </h3>
              <p className="text-[11px] text-slate-400 mb-4">
                These ingredients are below their low-stock threshold and have a preferred vendor + reorder quantity set. One click drafts the PO — nothing is sent automatically.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {suggestions.map((s) => (
                  <div key={s.vendorId} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-200">{s.vendorName}</span>
                      {canManage && (
                        <button
                          onClick={() => handleDraftSuggestion(s)}
                          disabled={draftingVendorId === s.vendorId}
                          className="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> {draftingVendorId === s.vendorId ? 'Drafting…' : 'Draft PO'}
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {s.items.map((item) => (
                        <div key={item.inventoryItemId} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300">{item.itemName}</span>
                          <span className="text-slate-500 tabular-nums">
                            {item.currentQuantity} {item.unit} on hand → order {item.reorderQuantity} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold">Vendors</h3>
              <span className="text-[10px] text-slate-500">{vendors.length} active</span>
            </div>
            {vendors.length === 0 ? (
              <p className="text-xs text-slate-500">No vendors yet — add one to start creating purchase orders.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {vendors.map((vendor) => (
                  <div key={vendor._id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950">
                    <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-[11px] font-bold text-slate-300 shrink-0">
                      {vendor.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-200 truncate">{vendor.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{vendor.category}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold">{openPoCount.get(vendor._id) || 0}</div>
                      <div className="text-[9px] text-slate-500">open POs</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold">Purchase order pipeline</h3>
              <span className="text-[10px] text-slate-500">{purchaseOrders.length} total</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {STATUS_COLUMNS.map((col) => {
                const orders = purchaseOrders.filter((po) => po.status === col.key);
                return (
                  <div key={col.key} className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 min-h-[120px]">
                    <div className="flex items-center justify-between px-1 pb-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{col.label}</span>
                      <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">{orders.length}</span>
                    </div>
                    {orders.map((po) => (
                      <div key={po._id} className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                        <div className="text-[9px] text-slate-500 font-bold">#{po._id.slice(-6)}</div>
                        <div className="text-xs font-bold text-slate-200 mt-0.5">{po.vendorName}</div>
                        <div className="text-[10px] text-slate-500 mt-1">{po.items.length} item(s)</div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs font-bold tabular-nums">Rs. {po.totalAmount.toFixed(0)}</span>
                          {canManage && (
                            <div className="flex items-center gap-1">
                              {po.status === 'draft' && (
                                <button
                                  onClick={() => handleDeletePo(po)}
                                  className="text-slate-500 hover:text-rose-400 transition p-1"
                                  title="Delete draft"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                              {NEXT_STATUS[po.status] && (
                                <button
                                  onClick={() => handleAdvance(po)}
                                  className="text-indigo-400 hover:text-indigo-300 transition p-1"
                                  title={`Advance to ${NEXT_STATUS[po.status]}`}
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {isVendorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsVendorModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-white mb-4">Vendors</h2>

            <div className="space-y-2 mb-5 max-h-48 overflow-y-auto">
              {vendors.map((vendor) => (
                <div key={vendor._id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">{vendor.name}</div>
                    <div className="text-[10px] text-slate-500">{vendor.category}</div>
                  </div>
                  <button onClick={() => handleDeleteVendor(vendor)} className="text-slate-500 hover:text-rose-400 transition p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {vendors.length === 0 && <p className="text-xs text-slate-500">No vendors yet.</p>}
            </div>

            {vendorError && (
              <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{vendorError}</div>
            )}

            <form onSubmit={handleCreateVendor} className="space-y-3">
              <input
                type="text"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="Vendor name"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <input
                type="text"
                value={vendorCategory}
                onChange={(e) => setVendorCategory(e.target.value)}
                placeholder="Category (e.g. Meat & Poultry)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition"
              >
                Add Vendor
              </button>
            </form>
          </div>
        </div>
      )}

      {isPoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsPoModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-white mb-4">New Purchase Order</h2>

            {poError && (
              <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{poError}</div>
            )}

            <form onSubmit={handleCreatePo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Vendor</label>
                <select
                  value={poVendorId}
                  onChange={(e) => setPoVendorId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  {vendors.map((v) => (
                    <option key={v._id} value={v._id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">Line Items</label>
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition inline-flex items-center gap-1"
                  >
                    <ScanLine className="w-3 h-3" /> Scan to add
                  </button>
                </div>
                {scanNotice && <p className="text-[11px] text-emerald-400 mb-2">{scanNotice}</p>}
                <div className="space-y-2">
                  {poLines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_70px_80px_auto] gap-2 items-center">
                      <select
                        value={line.inventoryItemId}
                        onChange={(e) => updateLine(idx, 'inventoryItemId', e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        {inventory.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.quantity}
                        onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                        placeholder="Qty"
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.unitCost}
                        onChange={(e) => updateLine(idx, 'unitCost', e.target.value)}
                        placeholder="Unit Rs."
                        className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                      {poLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setPoLines((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-slate-500 hover:text-rose-400 transition p-1.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPoLines((prev) => [...prev, { inventoryItemId: inventory[0]?._id || inventory[0]?.id || '', quantity: '', unitCost: '' }])
                  }
                  className="mt-2 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add line item
                </button>
              </div>

              <button
                type="submit"
                disabled={isSavingPo}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                {isSavingPo ? 'Creating…' : 'Create Purchase Order'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isScannerOpen && (
        <BarcodeScannerModal onDetect={handleBarcodeDetected} onClose={() => setIsScannerOpen(false)} />
      )}
    </div>
  );
};
