import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, X, Check, Ban } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { Transfer, Location } from '../../api/posApi';
import type { InventoryItem } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

function extractErrorMessage(err: unknown, fallback: string): string {
  const anyErr = err as any;
  return anyErr?.response?.data?.message || anyErr?.response?.data?.error || fallback;
}

const STATUS_STYLES: Record<Transfer['status'], string> = {
  in_transit: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  received: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  cancelled: 'bg-slate-800 text-slate-500 border-slate-700',
};

const STATUS_LABELS: Record<Transfer['status'], string> = {
  in_transit: 'In Transit',
  received: 'Received',
  cancelled: 'Cancelled',
};

function itemsSummary(transfer: Transfer): string {
  return transfer.items.map((i) => `${i.quantity} ${i.unit} ${i.itemName}`).join(', ');
}

export const TransfersPage: React.FC = () => {
  const { isOwner, currentUser, currentLocation } = useAuth();
  const canManage = isOwner || currentUser?.role === 'Manager';

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toLocationId, setToLocationId] = useState('');
  const [lines, setLines] = useState<{ inventoryItemId: string; quantity: string }[]>([
    { inventoryItemId: '', quantity: '' },
  ]);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadAll = async () => {
    try {
      const [transferData, locationData, inventoryData] = await Promise.all([
        posApi.getTransfers(),
        posApi.getLocations(),
        posApi.getInventory(),
      ]);
      setTransfers(transferData);
      setLocations(locationData);
      setInventory(inventoryData);
    } catch (err) {
      console.error('Failed to load transfers data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation?.id]);

  useRealtimeRefresh(['transfer', 'inventory'], loadAll);

  const otherLocations = useMemo(
    () => locations.filter((l) => l._id !== currentLocation?.id),
    [locations, currentLocation]
  );

  const outgoing = useMemo(
    () => transfers.filter((t) => t.fromLocationId === currentLocation?.id),
    [transfers, currentLocation]
  );
  const incoming = useMemo(
    () => transfers.filter((t) => t.toLocationId === currentLocation?.id),
    [transfers, currentLocation]
  );

  const openModal = () => {
    setToLocationId(otherLocations[0]?._id || '');
    setLines([{ inventoryItemId: inventory[0]?._id || inventory[0]?.id || '', quantity: '' }]);
    setFormError('');
    setIsModalOpen(true);
  };

  const updateLine = (idx: number, field: 'inventoryItemId' | 'quantity', value: string) => {
    setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line)));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!toLocationId) {
      setFormError('Pick a destination location.');
      return;
    }
    const items = lines
      .filter((l) => l.inventoryItemId && l.quantity)
      .map((l) => ({ inventoryItemId: l.inventoryItemId, quantity: Number(l.quantity) }));

    if (items.length === 0) {
      setFormError('Add at least one line item with a quantity.');
      return;
    }

    try {
      setIsSaving(true);
      await posApi.createTransfer({ toLocationId, items });
      setIsModalOpen(false);
      await loadAll();
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Failed to create transfer.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReceive = async (transfer: Transfer) => {
    if (!window.confirm(`Mark this transfer as received? This will add ${itemsSummary(transfer)} to this location's stock.`)) return;
    try {
      await posApi.receiveTransfer(transfer._id);
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to receive transfer.'));
    }
  };

  const handleCancel = async (transfer: Transfer) => {
    if (!window.confirm('Cancel this transfer? The stock already deducted will be refunded to this location.')) return;
    try {
      await posApi.cancelTransfer(transfer._id);
      await loadAll();
    } catch (err) {
      alert(extractErrorMessage(err, 'Failed to cancel transfer.'));
    }
  };

  const renderTransferCard = (transfer: Transfer, direction: 'outgoing' | 'incoming') => (
    <div key={transfer._id} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] text-slate-500 font-bold">#{transfer._id.slice(-6)}</div>
          <div className="text-xs font-bold text-slate-200 mt-0.5 truncate">
            {direction === 'outgoing' ? `To ${transfer.toLocationName}` : `From ${transfer.fromLocationName}`}
          </div>
        </div>
        <span className={`shrink-0 text-[9px] font-bold px-2 py-1 rounded-full border ${STATUS_STYLES[transfer.status]}`}>
          {STATUS_LABELS[transfer.status]}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 mt-2">{itemsSummary(transfer)}</div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-slate-600">{new Date(transfer.createdAt).toLocaleString()}</span>
        {canManage && transfer.status === 'in_transit' && (
          <div className="flex items-center gap-1">
            {direction === 'incoming' && (
              <button
                onClick={() => handleReceive(transfer)}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition px-2 py-1 rounded-lg hover:bg-emerald-500/10"
              >
                <Check className="w-3 h-3" /> Receive
              </button>
            )}
            {direction === 'outgoing' && (
              <button
                onClick={() => handleCancel(transfer)}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 hover:text-rose-300 transition px-2 py-1 rounded-lg hover:bg-rose-500/10"
              >
                <Ban className="w-3 h-3" /> Cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-indigo-400" /> Inter-Location Transfers
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Sending stock debits {currentLocation?.name || 'this location'} immediately; the destination confirms receipt to credit its own stock.
          </p>
        </div>
        {canManage && (
          <button
            onClick={openModal}
            disabled={otherLocations.length === 0 || inventory.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> New transfer
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading transfers…</div>
      ) : otherLocations.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-xs bg-slate-900 border border-slate-800 rounded-2xl">
          Transfers need at least two locations. Add another location first.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold">Outgoing from {currentLocation?.name}</h3>
              <span className="text-[10px] text-slate-500">{outgoing.length}</span>
            </div>
            {outgoing.length === 0 ? (
              <p className="text-xs text-slate-500">No outgoing transfers.</p>
            ) : (
              <div className="space-y-2.5">{outgoing.map((t) => renderTransferCard(t, 'outgoing'))}</div>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold">Incoming to {currentLocation?.name}</h3>
              <span className="text-[10px] text-slate-500">{incoming.length}</span>
            </div>
            {incoming.length === 0 ? (
              <p className="text-xs text-slate-500">No incoming transfers.</p>
            ) : (
              <div className="space-y-2.5">{incoming.map((t) => renderTransferCard(t, 'incoming'))}</div>
            )}
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-white mb-1">New Transfer</h2>
            <p className="text-[11px] text-slate-500 mb-4">
              From {currentLocation?.name} — stock is deducted here as soon as you create the transfer.
            </p>

            {formError && (
              <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{formError}</div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Destination location</label>
                <select
                  value={toLocationId}
                  onChange={(e) => setToLocationId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  {otherLocations.map((loc) => (
                    <option key={loc._id} value={loc._id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Line items</label>
                <div className="space-y-2">
                  {lines.map((line, idx) => {
                    const selected = inventory.find((i) => (i._id || i.id) === line.inventoryItemId);
                    return (
                      <div key={idx} className="grid grid-cols-[1fr_90px_auto] gap-2 items-center">
                        <select
                          value={line.inventoryItemId}
                          onChange={(e) => updateLine(idx, 'inventoryItemId', e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          {inventory.map((item) => (
                            <option key={item._id || item.id} value={item._id || item.id}>
                              {item.name} ({item.totalQuantity} {item.unit} on hand)
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          max={selected?.totalQuantity}
                          value={line.quantity}
                          onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                          placeholder="Qty"
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-slate-500 hover:text-rose-400 transition p-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setLines((prev) => [...prev, { inventoryItemId: inventory[0]?._id || inventory[0]?.id || '', quantity: '' }])
                  }
                  className="mt-2 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add line item
                </button>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                {isSaving ? 'Sending…' : 'Send Transfer'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
