import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Plus,
  Phone,
  Users,
  Clock,
  Check,
  X,
  UserCheck,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { Reservation } from '../../api/posApi';
import type { Table } from '../../types';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

function formatWait(createdAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min';
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  return `${hrs}h ${minutes % 60}m`;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  waiting: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  seated: 'bg-slate-700/40 text-slate-400 border-slate-600/40',
  cancelled: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  'no-show': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export const ReservationsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canView = hasPermission('reservations.view');
  const canManage = hasPermission('reservations.manage');

  const [activeTab, setActiveTab] = useState<'reservations' | 'waitlist'>('reservations');
  const [entries, setEntries] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPartySize, setFormPartySize] = useState('2');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [reservationData, tableData] = await Promise.all([posApi.getReservations(), posApi.getTables()]);
      setEntries(Array.isArray(reservationData) ? reservationData : []);
      setTables(Array.isArray(tableData) ? tableData : []);
    } catch (err) {
      console.error('Failed to load reservations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView]);

  useRealtimeRefresh(['reservation', 'table'], () => canView && loadData());

  const reservations = useMemo(
    () => entries.filter((e) => e.type === 'reservation').sort((a, b) => (a.reservationTime || '').localeCompare(b.reservationTime || '')),
    [entries]
  );
  const waitlist = useMemo(
    () => entries.filter((e) => e.type === 'waitlist').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [entries]
  );

  const tableNumber = (tableId: string | null) => {
    if (!tableId) return null;
    const table = tables.find((t) => (t._id || t.id) === tableId);
    return table ? table.number : null;
  };

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormPartySize('2');
    setFormDate('');
    setFormTime('');
    setFormNotes('');
    setFormError('');
  };

  const openForm = () => {
    resetForm();
    if (activeTab === 'reservations') {
      const now = new Date();
      setFormDate(now.toISOString().slice(0, 10));
      setFormTime('19:00');
    }
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formName.trim()) {
      setFormError('Enter a name.');
      return;
    }
    const partySize = Number(formPartySize);
    if (!partySize || partySize <= 0) {
      setFormError('Enter a valid party size.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (activeTab === 'reservations') {
        if (!formDate || !formTime) {
          setFormError('Pick a date and time.');
          setIsSubmitting(false);
          return;
        }
        const reservationTime = new Date(`${formDate}T${formTime}`).toISOString();
        await posApi.createReservation({
          customerName: formName.trim(),
          customerPhone: formPhone.trim() || undefined,
          partySize,
          reservationTime,
          notes: formNotes.trim() || undefined,
        });
      } else {
        await posApi.addToWaitlist({
          customerName: formName.trim(),
          customerPhone: formPhone.trim() || undefined,
          partySize,
          notes: formNotes.trim() || undefined,
        });
      }
      setIsFormOpen(false);
      resetForm();
      await loadData();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to save.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (entry: Reservation, status: Reservation['status']) => {
    try {
      await posApi.updateReservationStatus(entry._id, status);
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to update.');
    }
  };

  const handleDelete = async (entry: Reservation) => {
    if (!window.confirm(`Remove ${entry.customerName}'s entry?`)) return;
    try {
      await posApi.deleteReservation(entry._id);
      await loadData();
    } catch (err) {
      alert('Failed to remove entry.');
    }
  };

  if (!canView) {
    return (
      <div className="p-6 min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Access restricted</p>
          <p className="text-xs text-slate-500 mt-1">
            Ask an Owner to grant your role "View reservations &amp; the waitlist" if you need this.
          </p>
        </div>
      </div>
    );
  }

  const list = activeTab === 'reservations' ? reservations : waitlist;

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-indigo-400" /> Reservations &amp; Waitlist
          </h1>
          <p className="text-xs text-slate-400 mt-1">Book tables ahead, or manage who's waiting for one right now.</p>
        </div>
        {canManage && (
          <button
            onClick={openForm}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" /> {activeTab === 'reservations' ? 'New Reservation' : 'Add to Waitlist'}
          </button>
        )}
      </div>

      <div className="inline-flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
        {(['reservations', 'waitlist'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
              activeTab === tab ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab === 'reservations' ? `Reservations (${reservations.length})` : `Waitlist (${waitlist.length})`}
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {activeTab === 'reservations' ? 'No upcoming reservations.' : 'Nobody is currently waiting.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {list.map((entry) => {
              const seatedTable = tableNumber(entry.tableId);
              return (
                <div key={entry._id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs shrink-0">
                      {entry.partySize}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">{entry.customerName}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${STATUS_STYLES[entry.status]}`}>
                          {entry.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400">
                        {entry.customerPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {entry.customerPhone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {entry.partySize}
                        </span>
                        {entry.type === 'reservation' && entry.reservationTime ? (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {new Date(entry.reservationTime).toLocaleString()}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> waiting {formatWait(entry.createdAt)}
                          </span>
                        )}
                        {seatedTable != null && <span className="text-emerald-400">Table #{seatedTable}</span>}
                      </div>
                      {entry.notes && <p className="text-[11px] text-slate-500 mt-1">{entry.notes}</p>}
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1.5">
                      {(entry.status === 'pending' || entry.status === 'waiting') && entry.type === 'reservation' && (
                        <button
                          onClick={() => handleStatusChange(entry, 'confirmed')}
                          className="p-3 sm:p-2 hover:bg-emerald-500/10 rounded-lg text-slate-400 hover:text-emerald-400 transition"
                          title="Confirm"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      {['pending', 'confirmed', 'waiting'].includes(entry.status) && (
                        <button
                          onClick={() => handleStatusChange(entry, 'seated')}
                          className="p-3 sm:p-2 hover:bg-indigo-500/10 rounded-lg text-slate-400 hover:text-indigo-400 transition"
                          title="Mark Seated"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                      )}
                      {['pending', 'confirmed', 'waiting'].includes(entry.status) && (
                        <button
                          onClick={() => handleStatusChange(entry, 'no-show')}
                          className="p-3 sm:p-2 hover:bg-amber-500/10 rounded-lg text-slate-400 hover:text-amber-400 transition"
                          title="No-show"
                        >
                          <ShieldAlert className="w-4 h-4" />
                        </button>
                      )}
                      {['pending', 'confirmed', 'waiting'].includes(entry.status) && (
                        <button
                          onClick={() => handleStatusChange(entry, 'cancelled')}
                          className="p-3 sm:p-2 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(entry)}
                        className="p-3 sm:p-2 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsFormOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-white mb-4">
              {activeTab === 'reservations' ? 'New Reservation' : 'Add to Waitlist'}
            </h2>
            {formError && (
              <div className="mb-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{formError}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Customer name"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Party Size</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={formPartySize}
                  onChange={(e) => setFormPartySize(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              {activeTab === 'reservations' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Date</label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Time</label>
                    <input
                      type="time"
                      required
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition [color-scheme:dark]"
                    />
                  </div>
                </div>
              )}
              <input
                type="text"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : activeTab === 'reservations' ? 'Book Reservation' : 'Add to Waitlist'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
