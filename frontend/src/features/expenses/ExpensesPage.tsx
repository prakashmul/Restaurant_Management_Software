import React, { useEffect, useMemo, useState } from 'react';
import { Receipt, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { Expense, ExpenseCategory } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { useCurrency } from '../../hooks/useCurrency';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { toLocalRangeStartISO, toLocalRangeEndISO } from '../../lib/dateRange';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  staff_salary: 'Staff Salary',
  rent: 'Rent',
  electricity: 'Electricity',
  water: 'Water',
  miscellaneous: 'Miscellaneous',
  other: 'Other',
};

function formatLocalYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function firstOfThisMonth(): string {
  const d = new Date();
  return formatLocalYYYYMMDD(new Date(d.getFullYear(), d.getMonth(), 1));
}

export const ExpensesPage: React.FC = () => {
  const { hasPermission, isOwner } = useAuth();
  const currency = useCurrency();
  const canManage = isOwner || hasPermission('expenses.manage');

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const [startDate, setStartDate] = useState(firstOfThisMonth());
  const [endDate, setEndDate] = useState(formatLocalYYYYMMDD(new Date()));

  const [category, setCategory] = useState<ExpenseCategory>('miscellaneous');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(formatLocalYYYYMMDD(new Date()));
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('miscellaneous');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');

  const loadExpenses = async () => {
    try {
      const data = await posApi.getExpenses({
        startDate: startDate ? toLocalRangeStartISO(startDate) : undefined,
        endDate: endDate ? toLocalRangeEndISO(endDate) : undefined,
      });
      setExpenses(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  useRealtimeRefresh(['expense'], loadExpenses);

  const totalForRange = useMemo(() => expenses.reduce((sum, e) => sum + (e.amount || 0), 0), [expenses]);

  const totalsByCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of expenses) {
      map.set(e.category, (map.get(e.category) || 0) + (e.amount || 0));
    }
    return map;
  }, [expenses]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      alert('Enter a valid amount greater than 0.');
      return;
    }
    if (!date) {
      alert('Select a date for this expense.');
      return;
    }
    setIsSaving(true);
    try {
      await posApi.createExpense({ category, amount: amt, date, note: note.trim() || undefined });
      setAmount('');
      setNote('');
      await loadExpenses();
    } catch (err) {
      alert('Failed to add expense.');
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (expense: Expense) => {
    setEditingId(expense._id);
    setEditAmount(String(expense.amount));
    setEditCategory(expense.category);
    setEditDate(expense.date.slice(0, 10));
    setEditNote(expense.note || '');
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id: string) => {
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Enter a valid amount greater than 0.');
      return;
    }
    try {
      await posApi.updateExpense(id, { category: editCategory, amount: amt, date: editDate, note: editNote.trim() });
      setEditingId(null);
      await loadExpenses();
    } catch (err) {
      alert('Failed to update expense.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this expense entry?')) return;
    try {
      await posApi.deleteExpense(id);
      await loadExpenses();
    } catch (err) {
      alert('Failed to delete expense.');
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div>
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Receipt className="w-5 h-5 text-indigo-400" /> Expenses
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Operating costs — rent, salaries, utilities, and other spend that feeds Net Profit on the Dashboard.
        </p>
      </div>

      {canManage && (
        <form
          onSubmit={handleAddExpense}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
            >
              {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Amount ({currency})</label>
            <input
              type="number"
              min="0"
              step="any"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. August rent — Main Location"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-all shadow-lg shadow-indigo-900/20 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Add Expense
          </button>
        </form>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-400">Date range:</span>
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {Array.from(totalsByCategory.entries()).map(([cat, amt]) => (
            <span
              key={cat}
              className="text-[11px] bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-400"
            >
              {CATEGORY_LABELS[cat]}: <span className="text-slate-200 font-semibold">{currency}{amt.toLocaleString()}</span>
            </span>
          ))}
          <span className="text-xs bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg px-3 py-1.5 font-semibold">
            Total: {currency}{totalForRange.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-slate-300 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">Logged By</th>
                <th className="px-4 py-3 text-right">Amount</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500 italic">
                    Loading expenses…
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500 italic">
                    No expenses logged for this range.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) =>
                  editingId === expense._id ? (
                    <tr key={expense._id} className="bg-slate-800/30">
                      <td className="px-4 py-2">
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)}
                          className="bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS[c]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{expense.createdBy}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-24 bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 text-right focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => saveEdit(expense._id)}
                            className="text-emerald-400 hover:text-emerald-300 p-1.5 rounded-lg hover:bg-emerald-500/10 transition"
                            title="Save"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-700/40 transition"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={expense._id} className="hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-300">{expense.date.slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {CATEGORY_LABELS[expense.category]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{expense.note || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{expense.createdBy}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-200">
                        {currency}{expense.amount.toLocaleString()}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => startEdit(expense)}
                              className="text-slate-400 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(expense._id)}
                              className="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
