import React, { useEffect, useState } from 'react';
import { History, ShieldAlert } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { AuditLogEntry } from '../../api/posApi';
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
  const { isOwner } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEntries = async () => {
    try {
      const data = await posApi.getAuditLog(100);
      setEntries(data);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner) loadEntries();
    else setLoading(false);
  }, [isOwner]);

  useRealtimeRefresh(
    ['staff', 'table', 'category', 'menu', 'order', 'purchaseOrder'],
    () => isOwner && loadEntries()
  );

  if (!isOwner) {
    return (
      <div className="p-6 min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Owner access only</p>
          <p className="text-xs text-slate-500 mt-1">The audit log records sensitive changes across the restaurant, so only Owners can view it.</p>
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
          Who did what — staff, tables, menu, credits, orders, and procurement changes.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading audit log…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No recorded changes yet.</div>
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
