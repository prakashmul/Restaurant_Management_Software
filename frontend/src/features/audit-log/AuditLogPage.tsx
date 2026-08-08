import React, { useEffect, useMemo, useState } from 'react';
import { History, ShieldAlert, Search, X } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { AuditLogEntry, StaffMember } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const AuditLogPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canView = hasPermission('audit.view');

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [actorEmail, setActorEmail] = useState('');
  const [q, setQ] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadEntries = async () => {
    try {
      const data = await posApi.getAuditLog({
        actorEmail: actorEmail || undefined,
        q: q.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setEntries(data);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    loadEntries();
    posApi.getStaff().then(setStaff).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useEffect(() => {
    if (!canView) return;
    const handle = setTimeout(loadEntries, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorEmail, q, startDate, endDate]);

  useRealtimeRefresh(
    ['staff', 'table', 'category', 'menu', 'order', 'purchaseOrder', 'transfer', 'inventory'],
    () => canView && loadEntries()
  );

  const hasActiveFilters = !!(actorEmail || q || startDate || endDate);
  const clearFilters = () => {
    setActorEmail('');
    setQ('');
    setStartDate('');
    setEndDate('');
  };

  const staffOptions = useMemo(
    () => [...staff].sort((a, b) => a.name.localeCompare(b.name)),
    [staff]
  );

  if (!canView) {
    return (
      <div className="p-6 min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Access restricted</p>
          <p className="text-xs text-slate-500 mt-1">
            The audit log records sensitive changes — ask an Owner to grant your role "View the audit log" if you need this.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div>
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-400" /> Audit Log
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Who did what — staff, tables, menu, credits, orders, procurement, transfers, and more.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actions…"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
        <select
          value={actorEmail}
          onChange={(e) => setActorEmail(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
        >
          <option value="">Everyone</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.email}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
        />
        <span className="text-slate-600 text-xs">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
        />
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition px-2 py-1"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading audit log…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {hasActiveFilters ? 'No entries match these filters.' : 'No recorded changes yet.'}
          </div>
        ) : (
          <div className="flex flex-col">
            {entries.map((entry, idx) => (
              <div key={entry._id} className="grid grid-cols-[110px_24px_1fr] gap-3 py-3">
                <div className="text-[10px] text-slate-500 pt-0.5">{formatRelativeTime(entry.createdAt)}</div>
                <div className="flex flex-col items-center">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 mt-1 shrink-0" />
                  {idx < entries.length - 1 && <span className="flex-1 w-px bg-slate-800 mt-1" />}
                </div>
                <div className="text-xs text-slate-300 leading-relaxed pb-1">
                  <span className="font-bold text-slate-100">{entry.actorName}</span> {entry.action}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
