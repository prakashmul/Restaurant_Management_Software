import React, { useEffect, useState } from 'react';
import { Layers, Plus, Loader2, Pencil, Trash2, X, AlertTriangle, Users } from 'lucide-react';
import { platformAdminApi, type Plan, type PlanInput, type PageCatalogEntry } from './platformAdminApi';

function PlanFormModal({
  plan,
  pages,
  onClose,
  onSaved,
}: {
  plan: Plan | null;
  pages: PageCatalogEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!plan;
  const [name, setName] = useState(plan?.name || '');
  const [slug, setSlug] = useState(plan?.slug || '');
  const [priceMonthly, setPriceMonthly] = useState(String(plan?.priceMonthly ?? ''));
  const [priceAnnual, setPriceAnnual] = useState(String(plan?.priceAnnual ?? ''));
  const [perLocationPrice, setPerLocationPrice] = useState(String(plan?.perLocationPrice ?? '0'));
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set(plan?.pages || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const togglePage = (key: string) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setError('');
    if (!name.trim()) return setError('Plan name is required.');
    if (!isEdit && !slug.trim()) return setError('Slug is required.');

    const input: PlanInput = {
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      priceMonthly: Number(priceMonthly) || 0,
      priceAnnual: Number(priceAnnual) || 0,
      perLocationPrice: Number(perLocationPrice) || 0,
      pages: [...selectedPages],
    };

    setSaving(true);
    try {
      if (isEdit && plan) {
        await platformAdminApi.updatePlan(plan.id, input);
      } else {
        await platformAdminApi.createPlan(input);
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save plan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          disabled={saving}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-sm font-bold text-slate-100 mb-4">{isEdit ? `Edit ${plan?.name}` : 'New plan'}</h2>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Growth"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. growth"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">Lowercase letters, numbers, and hyphens only. Can't be changed later.</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Rs. / month</label>
              <input
                type="number"
                min="0"
                value={priceMonthly}
                onChange={(e) => setPriceMonthly(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Rs. / year</label>
              <input
                type="number"
                min="0"
                value={priceAnnual}
                onChange={(e) => setPriceAnnual(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">+ / location</label>
              <input
                type="number"
                min="0"
                value={perLocationPrice}
                onChange={(e) => setPerLocationPrice(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
              Pages included by default ({selectedPages.size})
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto p-1">
              {pages.map((page) => (
                <label
                  key={page.key}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer transition text-xs text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={selectedPages.has(page.key)}
                    onChange={() => togglePage(page.key)}
                    className="w-3.5 h-3.5 rounded accent-amber-500"
                  />
                  {page.label}
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              This is only the default a restaurant gets when assigned this plan — the Tenant Directory's
              own page checkboxes still control what each restaurant actually has, and any page granted
              there by hand isn't affected by editing this list.
            </p>
          </div>
        </div>

        <div className="flex gap-2.5 mt-5">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 rounded-xl transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 rounded-xl transition disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isEdit ? 'Save changes' : 'Create plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeletePlanModal({
  plan,
  onClose,
  onDeleted,
}: {
  plan: Plan;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setError('');
    setDeleting(true);
    try {
      await platformAdminApi.deletePlan(plan.id);
      onDeleted();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete plan.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl">
        <div className="text-center space-y-2 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Delete {plan.name}?</h2>
          <p className="text-xs text-slate-400">
            {plan.restaurantCount > 0
              ? `${plan.restaurantCount} restaurant${plan.restaurantCount === 1 ? ' is' : 's are'} currently on this plan — move ${plan.restaurantCount === 1 ? 'it' : 'them'} to a different plan first.`
              : 'This cannot be undone. Restaurants already granted this plan\'s pages keep them — deleting a plan never removes access from anyone.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
            {error}
          </div>
        )}

        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 rounded-xl transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting || plan.restaurantCount > 0}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2.5 rounded-xl transition disabled:opacity-40"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export const PlansPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [pages, setPages] = useState<PageCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [formTarget, setFormTarget] = useState<'new' | Plan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  const load = () => {
    setLoading(true);
    return Promise.all([platformAdminApi.listPlans(), platformAdminApi.getPageCatalog()])
      .then(([p, pg]) => {
        setPlans(p);
        setPages(pg);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const totalMrr = plans.reduce((sum, p) => sum + p.priceMonthly * p.restaurantCount, 0);
  const totalSubscribed = plans.reduce((sum, p) => sum + p.restaurantCount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Plans</h2>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Rs. {totalMrr.toLocaleString()} MRR across {totalSubscribed} subscription{totalSubscribed === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={() => setFormTarget('new')}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3.5 py-2 rounded-lg transition"
        >
          <Plus className="w-3.5 h-3.5" /> New plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-xs">No plans defined yet.</div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800">
          {plans.map((p) => (
            <div key={p.id} className="bg-slate-900 flex items-center justify-between gap-3 px-4 py-3.5 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-100">{p.name}</p>
                    {!p.isActive && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-full">inactive</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Rs. {p.priceMonthly.toLocaleString()}/mo
                    {p.perLocationPrice > 0 && ` + Rs. ${p.perLocationPrice.toLocaleString()}/location`}
                    {' · '}
                    {p.pages.length} page{p.pages.length === 1 ? '' : 's'}
                    {' · '}
                    {p.restaurantCount} restaurant{p.restaurantCount === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setFormTarget(p)}
                  className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs px-3 py-2 rounded-lg transition"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => setDeleteTarget(p)}
                  className="inline-flex items-center gap-1.5 bg-rose-600/10 hover:bg-rose-600 border border-rose-600/40 hover:border-rose-600 text-rose-400 hover:text-white font-semibold text-xs px-3 py-2 rounded-lg transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formTarget && (
        <PlanFormModal
          plan={formTarget === 'new' ? null : formTarget}
          pages={pages}
          onClose={() => setFormTarget(null)}
          onSaved={() => {
            setFormTarget(null);
            load();
          }}
        />
      )}

      {deleteTarget && (
        <DeletePlanModal
          plan={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            load();
          }}
        />
      )}
    </div>
  );
};
