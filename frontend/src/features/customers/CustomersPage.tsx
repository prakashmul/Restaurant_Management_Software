import React, { useEffect, useMemo, useState } from 'react';
import { Users2, ShieldAlert, Search, Edit2, X, Receipt, Gift } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { CustomerProfile, CustomerDetail } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const CustomersPage: React.FC = () => {
  const { hasPermission, currentRestaurant, currentLocation } = useAuth();
  const currency = currentLocation?.currency || currentRestaurant?.currency || 'Rs.';
  const canView = hasPermission('customers');

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadCustomers = async () => {
    try {
      const data = await posApi.getCustomers();
      setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useRealtimeRefresh(['order'], () => canView && loadCustomers());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, search]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setIsLoadingDetail(true);
    setIsEditing(false);
    try {
      const data = await posApi.getCustomer(id);
      setDetail(data);
      setEditName(data.customer.name);
      setEditPhone(data.customer.phone);
    } catch (err) {
      console.error('Failed to load customer detail:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedId) return;
    setEditError('');
    setIsSaving(true);
    try {
      await posApi.updateCustomer(selectedId, { name: editName.trim(), phone: editPhone.trim() });
      await loadCustomers();
      const refreshed = await posApi.getCustomer(selectedId);
      setDetail(refreshed);
      setIsEditing(false);
    } catch (err: any) {
      setEditError(err?.response?.data?.message || 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!canView) {
    return (
      <div className="p-6 min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Access restricted</p>
          <p className="text-xs text-slate-500 mt-1">
            Ask an Owner to grant your role "View &amp; edit customers" if you need this.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div>
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Users2 className="w-5 h-5 text-indigo-400" /> Customers
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Order history, lifetime spend, and outstanding credit for every customer at this location.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading customers…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {search ? 'No customers match that search.' : 'No customers yet — they appear here after a credit order.'}
          </div>
        ) : (
          <>
            {/* Mobile/tablet: one card per customer */}
            <div className="lg:hidden divide-y divide-slate-800/80">
              {filtered.map((c) => (
                <button
                  key={c._id}
                  onClick={() => openDetail(c._id)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-800/30 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200 truncate">{c.name}</span>
                    <span className="text-xs font-bold tabular-nums text-slate-200 shrink-0">
                      {currency} {c.lifetimeSpend.toFixed(0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1 text-[10.5px] text-slate-400">
                    <span className="truncate">{c.phone || '—'} · {c.ordersCount} orders · {formatDate(c.lastOrderAt)}</span>
                    {c.outstandingCredit > 0 ? (
                      <span className="text-amber-400 font-semibold shrink-0">Owes {currency} {c.outstandingCredit.toFixed(0)}</span>
                    ) : (
                      <span className="text-amber-400 font-semibold shrink-0">{c.pointsBalance} pts</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop: full table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="text-left font-semibold px-5 py-3">Name</th>
                    <th className="text-left font-semibold px-5 py-3">Phone</th>
                    <th className="text-right font-semibold px-5 py-3">Orders</th>
                    <th className="text-right font-semibold px-5 py-3">Lifetime Spend</th>
                    <th className="text-right font-semibold px-5 py-3">Outstanding</th>
                    <th className="text-right font-semibold px-5 py-3">Points</th>
                    <th className="text-left font-semibold px-5 py-3">Last Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {filtered.map((c) => (
                    <tr
                      key={c._id}
                      onClick={() => openDetail(c._id)}
                      className="hover:bg-slate-800/30 transition cursor-pointer"
                    >
                      <td className="px-5 py-3 font-semibold text-slate-200">{c.name}</td>
                      <td className="px-5 py-3 text-slate-400">{c.phone || '—'}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{c.ordersCount}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-slate-200">
                        {currency} {c.lifetimeSpend.toFixed(0)}
                      </td>
                      <td className={`px-5 py-3 text-right tabular-nums font-semibold ${c.outstandingCredit > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {currency} {c.outstandingCredit.toFixed(0)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold text-amber-400">
                        {c.pointsBalance}
                      </td>
                      <td className="px-5 py-3 text-slate-400">{formatDate(c.lastOrderAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={closeDetail}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            {isLoadingDetail || !detail ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
            ) : (
              <>
                <div className="mb-5 pr-8">
                  {isEditing ? (
                    <div className="space-y-2">
                      {editError && <div className="text-[11px] text-rose-400">{editError}</div>}
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500"
                      />
                      <input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="Phone"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setIsEditing(false)}
                          className="text-[11px] font-bold text-slate-400 hover:text-slate-200 px-3 py-1.5 border border-slate-800 rounded-lg transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={isSaving}
                          className="text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{detail.customer.name}</h2>
                      <button
                        onClick={() => setIsEditing(true)}
                        className="text-slate-500 hover:text-indigo-400 transition p-1.5 sm:p-0 -m-1.5 sm:m-0"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {!isEditing && <p className="text-xs text-slate-400 mt-0.5">{detail.customer.phone || 'No phone on file'}</p>}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Orders</div>
                    <div className="text-base font-bold mt-1 tabular-nums">{detail.stats.ordersCount}</div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Lifetime</div>
                    <div className="text-base font-bold mt-1 tabular-nums">{currency} {detail.stats.lifetimeSpend.toFixed(0)}</div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Owed</div>
                    <div className={`text-base font-bold mt-1 tabular-nums ${detail.stats.outstandingCredit > 0 ? 'text-amber-400' : ''}`}>
                      {currency} {detail.stats.outstandingCredit.toFixed(0)}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
                      <Gift className="w-2.5 h-2.5" /> Points
                    </div>
                    <div className="text-base font-bold mt-1 tabular-nums text-amber-400">{detail.stats.pointsBalance}</div>
                  </div>
                </div>

                <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
                  <Receipt className="w-3 h-3" /> Order history
                </h3>
                <div className="space-y-2">
                  {detail.orders.length === 0 ? (
                    <p className="text-xs text-slate-500">No orders yet.</p>
                  ) : (
                    detail.orders.map((o) => (
                      <div
                        key={o._id || o.id}
                        className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5"
                      >
                        <div>
                          <div className="text-xs font-semibold text-slate-200">
                            {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'}
                          </div>
                          <div className="text-[10px] text-slate-500 capitalize">{o.status}</div>
                        </div>
                        <div className="text-sm font-bold font-mono text-slate-200">
                          {currency} {(o.total || 0).toFixed(0)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
