import React, { useEffect, useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Mail, Save, Loader2, CheckCircle2, Trash2, AlertTriangle, X, RotateCcw } from 'lucide-react';
import { platformAdminApi, type TenantRestaurant, type PageCatalogEntry, type Plan } from './platformAdminApi';

// A plan only ever supplies defaults — picking one here unions its pages
// into the restaurant's existing enabledPages (see assignRestaurantPlan on
// the backend) rather than replacing it, so a page granted below by hand
// for this one restaurant survives a plan change instead of being reset.
function PlanSelector({
  restaurant,
  plans,
  onChanged,
}: {
  restaurant: TenantRestaurant;
  plans: Plan[];
  onChanged: (restaurantId: string, planId: string, planName: string, enabledPages: string[]) => void;
}) {
  const [assigning, setAssigning] = useState(false);

  const handleChange = async (planId: string) => {
    if (!planId || planId === restaurant.planId) return;
    setAssigning(true);
    try {
      const result = await platformAdminApi.assignRestaurantPlan(restaurant.id, planId);
      onChanged(restaurant.id, result.planId, result.planName, result.enabledPages);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <select
        value={restaurant.planId || ''}
        onChange={(e) => handleChange(e.target.value)}
        disabled={assigning}
        className="appearance-none bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold pl-2.5 pr-6 py-1 rounded-full focus:outline-none focus:border-amber-500 disabled:opacity-50 cursor-pointer"
      >
        <option value="" disabled>
          No plan
        </option>
        {plans.map((p) => (
          <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
            {p.name}
          </option>
        ))}
      </select>
      {assigning ? (
        <Loader2 className="w-3 h-3 animate-spin absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none" />
      ) : (
        <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none" />
      )}
    </div>
  );
}

function PageAccessEditor({
  restaurant,
  pages,
  onSaved,
}: {
  restaurant: TenantRestaurant;
  pages: PageCatalogEntry[];
  onSaved: (restaurantId: string, enabledPages: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(restaurant.enabledPages));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Keeps the checkbox grid in sync when enabledPages changes from outside
  // this component — e.g. the plan dropdown (in the collapsed row header)
  // or the reset button below — while this row happens to already be
  // expanded. Without this, only the "N pages enabled" badge in the header
  // would update; the checkboxes here would keep showing the stale set
  // until the row was collapsed and re-expanded.
  useEffect(() => {
    setSelected(new Set(restaurant.enabledPages));
  }, [restaurant.id, restaurant.enabledPages]);

  const handleReset = async () => {
    setResetting(true);
    try {
      const result = await platformAdminApi.resetRestaurantPlanDefaults(restaurant.id);
      onSaved(restaurant.id, result.enabledPages);
    } finally {
      setResetting(false);
    }
  };

  const toggle = (key: string) => {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await platformAdminApi.updateRestaurantPages(restaurant.id, [...selected]);
      onSaved(restaurant.id, result.enabledPages);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-slate-800 bg-slate-950/60 p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {pages.map((page) => (
          <label
            key={page.key}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition text-xs text-slate-300"
          >
            <input
              type="checkbox"
              checked={selected.has(page.key)}
              onChange={() => toggle(page.key)}
              className="w-3.5 h-3.5 rounded accent-amber-500"
            />
            {page.label}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save access
        </button>
        {restaurant.planId && (
          <button
            onClick={handleReset}
            disabled={resetting}
            title={`Replace the checkboxes above with exactly ${restaurant.planName || 'the assigned plan'}'s pages — drops anything extra, including manual grants.`}
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-slate-200 font-semibold text-xs px-2 py-2 rounded-lg transition disabled:opacity-50"
          >
            {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Reset to {restaurant.planName || 'plan'} defaults
          </button>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

function DeleteRestaurantModal({
  restaurant,
  onClose,
  onDeleted,
}: {
  restaurant: TenantRestaurant;
  onClose: () => void;
  onDeleted: (restaurantId: string) => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const canDelete = confirmText.trim() === restaurant.name;

  const handleDelete = async () => {
    if (!canDelete) return;
    setError('');
    setDeleting(true);
    try {
      await platformAdminApi.deleteRestaurant(restaurant.id);
      onDeleted(restaurant.id);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete restaurant.');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          disabled={deleting}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Delete {restaurant.name}?</h2>
          <p className="text-xs text-slate-400">
            This permanently deletes the restaurant and <strong className="text-slate-300">everything tied to it</strong> —
            staff, locations, menu, inventory, orders, customers, expenses, all of it. Anyone whose login is only
            tied to this restaurant will need to register as a brand-new restaurant to use their email again. This
            cannot be undone.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
            {error}
          </div>
        )}

        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
          Type <span className="font-mono text-rose-400">{restaurant.name}</span> to confirm
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={deleting}
          placeholder={restaurant.name}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500 transition disabled:opacity-50"
        />

        <div className="flex gap-2.5 mt-5">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 rounded-xl transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs py-2.5 rounded-xl transition disabled:opacity-40"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
}

export const TenantDirectoryPage: React.FC = () => {
  const [restaurants, setRestaurants] = useState<TenantRestaurant[]>([]);
  const [pages, setPages] = useState<PageCatalogEntry[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantRestaurant | null>(null);

  useEffect(() => {
    Promise.all([platformAdminApi.listRestaurants(), platformAdminApi.getPageCatalog(), platformAdminApi.listPlans()])
      .then(([r, p, pl]) => {
        setRestaurants(r);
        setPages(p);
        setPlans(pl);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = (restaurantId: string, enabledPages: string[]) => {
    setRestaurants((prev) => prev.map((r) => (r.id === restaurantId ? { ...r, enabledPages } : r)));
  };

  const handlePlanChanged = (restaurantId: string, planId: string, planName: string, enabledPages: string[]) => {
    setRestaurants((prev) =>
      prev.map((r) => (r.id === restaurantId ? { ...r, planId, planName, enabledPages } : r))
    );
  };

  const handleDeleted = (restaurantId: string) => {
    setRestaurants((prev) => prev.filter((r) => r.id !== restaurantId));
    setDeleteTarget(null);
    if (expandedId === restaurantId) setExpandedId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-100">Restaurant Directory</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Every restaurant on the platform. Expand one to control which pages it's entitled to.
        </p>
      </div>

      {restaurants.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-xs">No restaurants have signed up yet.</div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800">
          {restaurants.map((r) => {
            const isOpen = expandedId === r.id;
            return (
              <div key={r.id} className="bg-slate-900">
                <button
                  onClick={() => setExpandedId(isOpen ? null : r.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-800/40 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100 truncate">{r.name}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                        <Mail className="w-3 h-3 shrink-0" />
                        {r.owner?.email || 'No owner on file'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <PlanSelector restaurant={r} plans={plans} onChanged={handlePlanChanged} />
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-800 px-2 py-1 rounded-full">
                      {r.enabledPages.length} page{r.enabledPages.length === 1 ? '' : 's'} enabled
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <>
                    <PageAccessEditor restaurant={r} pages={pages} onSaved={handleSaved} />
                    <div className="border-t border-slate-800 bg-rose-500/5 p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-rose-400">Danger zone</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Permanently delete this restaurant and all of its data.
                        </p>
                      </div>
                      <button
                        onClick={() => setDeleteTarget(r)}
                        className="inline-flex items-center gap-2 bg-rose-600/10 hover:bg-rose-600 border border-rose-600/40 hover:border-rose-600 text-rose-400 hover:text-white font-bold text-xs px-3.5 py-2 rounded-lg transition shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Restaurant
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deleteTarget && (
        <DeleteRestaurantModal
          restaurant={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
};
