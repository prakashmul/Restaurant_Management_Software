import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { Shift, StaffMember, ScheduleVariance } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTimeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)} hrs`;
}

export const SchedulingPage: React.FC = () => {
  const { isOwner, currentUser } = useAuth();
  const canManage = isOwner || currentUser?.role === 'Manager';

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [variance, setVariance] = useState<ScheduleVariance | null>(null);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formStaffId, setFormStaffId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formStart, setFormStart] = useState('10:00');
  const [formEnd, setFormEnd] = useState('18:00');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
    [weekStart]
  );
  const rangeStart = toDateStr(weekDays[0]);
  const rangeEnd = toDateStr(weekDays[6]);

  const loadAll = async () => {
    try {
      const [staffData, shiftData, varianceData] = await Promise.all([
        posApi.getStaff(),
        posApi.getShifts(rangeStart, rangeEnd),
        canManage ? posApi.getScheduleVariance(rangeStart, rangeEnd) : Promise.resolve(null),
      ]);
      setStaff(staffData);
      setShifts(shiftData);
      setVariance(varianceData);
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd, canManage]);

  useRealtimeRefresh(['shift'], loadAll);

  const openAddModal = (staffMembershipId?: string, date?: string) => {
    setFormStaffId(staffMembershipId || staff[0]?.id || '');
    setFormDate(date || rangeStart);
    setFormStart('10:00');
    setFormEnd('18:00');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formStaffId || !formDate) {
      setFormError('Pick a staff member and date.');
      return;
    }
    try {
      setIsSaving(true);
      await posApi.createShift({ staffMembershipId: formStaffId, date: formDate, startTime: formStart, endTime: formEnd });
      setIsModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setFormError(err?.response?.data?.message || 'Failed to create shift.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteShift = async (shift: Shift) => {
    if (!canManage) return;
    if (!window.confirm(`Remove ${shift.staffName}'s ${formatTimeLabel(shift.startTime)}–${formatTimeLabel(shift.endTime)} shift on ${shift.date}?`)) return;
    try {
      await posApi.deleteShift(shift._id);
      await loadAll();
    } catch (err) {
      console.error('Failed to delete shift:', err);
    }
  };

  const shiftFor = (staffMembershipId: string, dateStr: string) =>
    shifts.filter((s) => s.staffMembershipId === staffMembershipId && s.date === dateStr);

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-indigo-400" /> Staff Scheduling
          </h1>
          <p className="text-xs text-slate-400 mt-1">Plan shifts ahead, then compare against actual clock-ins.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7))}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-slate-300 tabular-nums w-40 text-center">
            {weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} –{' '}
            {weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7))}
            className="p-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {canManage && (
            <button
              onClick={() => openAddModal()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20 ml-2"
            >
              <Plus className="w-3.5 h-3.5" /> Add shift
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading schedule…</div>
      ) : staff.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-2xl">
          No staff members yet.
        </div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left font-semibold px-4 py-3 text-slate-400 w-40">Staff</th>
                  {weekDays.map((d, i) => (
                    <th key={i} className="text-center font-semibold px-2 py-3 text-slate-400 text-[10px] uppercase tracking-wider">
                      {DAY_LABELS[i]}
                      <div className="text-slate-600 font-normal normal-case tabular-nums">{d.getDate()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-slate-200">{member.name}</div>
                      <div className="text-[10px] text-slate-500">{member.role}</div>
                    </td>
                    {weekDays.map((d, i) => {
                      const dateStr = toDateStr(d);
                      const dayShifts = shiftFor(member.id, dateStr);
                      return (
                        <td key={i} className="px-1.5 py-2 align-top">
                          <div className="flex flex-col gap-1 items-center">
                            {dayShifts.map((shift) => (
                              <button
                                key={shift._id}
                                onClick={() => handleDeleteShift(shift)}
                                disabled={!canManage}
                                title={canManage ? 'Click to remove' : undefined}
                                className="w-full text-[10px] font-semibold px-1.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-rose-500/15 hover:text-rose-300 transition"
                              >
                                {formatTimeLabel(shift.startTime)}–{formatTimeLabel(shift.endTime)}
                              </button>
                            ))}
                            {canManage && dayShifts.length === 0 && (
                              <button
                                onClick={() => openAddModal(member.id, dateStr)}
                                className="w-6 h-6 rounded-lg border border-dashed border-slate-700 text-slate-600 hover:text-indigo-400 hover:border-indigo-500/50 transition flex items-center justify-center"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {variance && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Planned hours</div>
                <div className="text-xl font-bold mt-1 tabular-nums">{formatHours(variance.totalPlannedSeconds)}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Actual clocked</div>
                <div className="text-xl font-bold mt-1 tabular-nums">{formatHours(variance.totalActualSeconds)}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Variance</div>
                <div
                  className="text-xl font-bold mt-1 tabular-nums"
                  style={{ color: variance.variancePercent === null ? undefined : variance.variancePercent <= 0 ? '#10b981' : '#f43f5e' }}
                >
                  {variance.variancePercent === null ? '—' : `${variance.variancePercent > 0 ? '+' : ''}${variance.variancePercent.toFixed(1)}%`}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-white mb-5">Add Shift</h2>

            {formError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{formError}</div>
            )}

            <form onSubmit={handleCreateShift} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Staff Member</label>
                <select
                  value={formStaffId}
                  onChange={(e) => setFormStaffId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Date</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Start</label>
                  <input
                    type="time"
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">End</label>
                  <input
                    type="time"
                    required
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Add Shift'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
