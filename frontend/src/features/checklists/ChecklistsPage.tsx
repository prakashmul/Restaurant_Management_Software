import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Plus, Trash2, X, Check } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { ChecklistCompletion, ChecklistTemplate } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';

export const ChecklistsPage: React.FC = () => {
  const { isOwner, currentUser } = useAuth();
  const canManageTemplates = isOwner || currentUser?.role === 'Manager';

  const [completions, setCompletions] = useState<ChecklistCompletion[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newItems, setNewItems] = useState<string[]>(['']);
  const [createError, setCreateError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadAll = async () => {
    try {
      const [todayData, templateData] = await Promise.all([
        posApi.getTodayChecklists(),
        canManageTemplates ? posApi.getChecklistTemplates() : Promise.resolve<ChecklistTemplate[]>([]),
      ]);
      setCompletions(todayData);
      setTemplates(templateData);
    } catch (err) {
      console.error('Failed to load checklists:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [canManageTemplates]);

  useRealtimeRefresh(['checklist'], loadAll);

  const handleToggle = async (completion: ChecklistCompletion, itemIndex: number) => {
    // Optimistic update so the checkbox responds immediately.
    setCompletions((prev) =>
      prev.map((c) =>
        c.completionId !== completion.completionId
          ? c
          : {
              ...c,
              items: c.items.map((i) => (i.index === itemIndex ? { ...i, done: !i.done } : i)),
              completedCount: c.completedCount + (completion.items[itemIndex].done ? -1 : 1),
            }
      )
    );
    try {
      const updated = await posApi.toggleChecklistItem(completion.completionId, itemIndex);
      setCompletions((prev) => prev.map((c) => (c.completionId === updated.completionId ? updated : c)));
    } catch (err) {
      console.error('Failed to toggle checklist item:', err);
      await loadAll();
    }
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewItems(['']);
    setCreateError('');
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    const cleanItems = newItems.map((i) => i.trim()).filter(Boolean);

    if (!newName.trim() || cleanItems.length === 0) {
      setCreateError('Give the checklist a name and at least one item.');
      return;
    }

    try {
      setIsSaving(true);
      await posApi.createChecklistTemplate({ name: newName.trim(), items: cleanItems });
      resetCreateForm();
      setIsCreateOpen(false);
      await loadAll();
    } catch (err) {
      console.error('Failed to create checklist template:', err);
      setCreateError('Failed to create checklist template.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: ChecklistTemplate) => {
    if (!window.confirm(`Delete the "${template.name}" checklist template? This removes its history too.`)) return;
    try {
      await posApi.deleteChecklistTemplate(template._id);
      await loadAll();
    } catch (err) {
      console.error('Failed to delete checklist template:', err);
      alert('Failed to delete checklist template.');
    }
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-indigo-400" /> Task &amp; Compliance Checklists
          </h1>
          <p className="text-xs text-slate-400 mt-1">Set once, verified every shift.</p>
        </div>
        {canManageTemplates && (
          <button
            onClick={() => {
              resetCreateForm();
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-3.5 h-3.5" /> New checklist template
          </button>
        )}
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading checklists…</div>
      ) : completions.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-2xl">
          {canManageTemplates
            ? 'No checklist templates yet — create one to start tracking daily tasks.'
            : 'No checklists have been set up for today yet.'}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {completions.map((completion) => {
            const template = templates.find((t) => t._id === completion.templateId);
            const isComplete = completion.completedCount === completion.totalCount;
            return (
              <div key={completion.completionId} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{completion.templateName}</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">{completion.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        isComplete
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {completion.completedCount}/{completion.totalCount}
                    </span>
                    {canManageTemplates && template && (
                      <button
                        onClick={() => handleDeleteTemplate(template)}
                        className="text-slate-500 hover:text-rose-400 transition p-1"
                        title="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-0.5">
                  {completion.items.map((item) => (
                    <button
                      key={item.index}
                      onClick={() => handleToggle(completion, item.index)}
                      className="w-full flex items-center gap-3 py-2 px-1 rounded-lg hover:bg-slate-800/40 transition text-left"
                    >
                      <span
                        className={`w-4 h-4 rounded shrink-0 border flex items-center justify-center transition ${
                          item.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
                        }`}
                      >
                        {item.done && <Check className="w-3 h-3 text-slate-950" strokeWidth={3} />}
                      </span>
                      <span className={`text-xs flex-1 ${item.done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                        {item.text}
                      </span>
                      {item.done && <span className="text-[10px] text-slate-500 shrink-0">{item.completedBy}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-5">
              <h2 className="text-lg font-bold text-white">New Checklist Template</h2>
              <p className="text-xs text-slate-400 mt-1">A fresh copy of this list is generated automatically every day.</p>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTemplate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Checklist Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Opening Checklist"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Items</label>
                <div className="space-y-2">
                  {newItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item}
                        onChange={(e) =>
                          setNewItems((prev) => prev.map((it, i) => (i === idx ? e.target.value : it)))
                        }
                        placeholder={`Item ${idx + 1}`}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                      />
                      {newItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewItems((prev) => prev.filter((_, i) => i !== idx))}
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
                  onClick={() => setNewItems((prev) => [...prev, ''])}
                  className="mt-2 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add item
                </button>
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Create Template'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
