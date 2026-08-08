import React, { useEffect, useMemo, useState } from 'react';
import { ChefHat, Clock, Check } from 'lucide-react';
import { posApi } from '../../api/posApi';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import type { Order, Table } from '../../types';

function formatElapsed(createdAt?: string): { label: string; minutes: number } {
  if (!createdAt) return { label: '—', minutes: 0 };
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return { label: 'just now', minutes };
  if (minutes === 1) return { label: '1 min', minutes };
  return { label: `${minutes} min`, minutes };
}

function urgencyClasses(minutes: number): string {
  if (minutes >= 20) return 'border-rose-500/50 bg-rose-500/5';
  if (minutes >= 10) return 'border-amber-500/50 bg-amber-500/5';
  return 'border-slate-800 bg-slate-900';
}

function urgencyBadgeClasses(minutes: number): string {
  if (minutes >= 20) return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (minutes >= 10) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-slate-800 text-slate-400 border-slate-700';
}

export const KitchenDisplayPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const fetchData = async () => {
    try {
      const [orderData, tableData] = await Promise.all([posApi.getKitchenOrders(), posApi.getTables()]);
      setOrders(Array.isArray(orderData) ? orderData : []);
      setTables(Array.isArray(tableData) ? tableData : []);
    } catch (err) {
      console.error('Failed to load kitchen orders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtimeRefresh(['order'], fetchData);

  // Re-render every 30s so elapsed-time badges (and their urgency color)
  // stay current without needing a fresh fetch.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const tableNumber = (tableId: string) => {
    const table = tables.find((t) => (t._id || t.id) === tableId);
    return table ? table.number : '?';
  };

  const handleBump = async (order: Order, itemId?: string) => {
    if (!itemId) return;
    const orderId = order._id || order.id;
    if (!orderId) return;
    try {
      const updated = await posApi.bumpOrderItem(orderId, itemId);
      setOrders((prev) => prev.map((o) => ((o._id || o.id) === orderId ? updated : o)));
    } catch (err) {
      console.error('Failed to bump item:', err);
    }
  };

  const tickets = useMemo(
    () =>
      orders.map((order) => {
        const elapsed = formatElapsed(order.createdAt);
        const allBumped = order.items.length > 0 && order.items.every((i) => i.bumped);
        return { order, elapsed, allBumped };
      }),
    // `now` is read only to force a periodic recompute of elapsed time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, now]
  );

  return (
    <div className="p-6 bg-slate-950 text-slate-100 min-h-screen space-y-6">
      <div className="flex items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <ChefHat className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Kitchen Display</h1>
          <p className="text-xs text-slate-400">
            {tickets.length} ticket{tickets.length === 1 ? '' : 's'} in the queue — oldest first.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm">
          Kitchen's clear — no pending orders right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tickets.map(({ order, elapsed, allBumped }) => {
            const orderId = order._id || order.id || '';
            return (
              <div
                key={orderId}
                className={`rounded-2xl border p-4 space-y-3 transition ${urgencyClasses(elapsed.minutes)} ${
                  allBumped ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-xs font-bold text-indigo-400">ORD-{orderId.slice(-6)}</div>
                    <div className="text-sm font-bold text-slate-100">Table #{tableNumber(order.tableId)}</div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border ${urgencyBadgeClasses(
                      elapsed.minutes
                    )}`}
                  >
                    <Clock className="w-3 h-3" /> {elapsed.label}
                  </span>
                </div>

                <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
                  {order.items.map((item, idx) => (
                    <button
                      key={item._id || idx}
                      onClick={() => handleBump(order, item._id)}
                      disabled={!item._id}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-xs font-semibold transition ${
                        item.bumped
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 line-through'
                          : 'bg-slate-950 border border-slate-800 text-slate-200 hover:border-indigo-500/50'
                      }`}
                    >
                      <span>
                        {item.quantity}x {item.name}
                      </span>
                      <span
                        className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center border ${
                          item.bumped ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-700'
                        }`}
                      >
                        {item.bumped && <Check className="w-3.5 h-3.5" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
