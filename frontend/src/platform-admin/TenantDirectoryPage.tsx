import React, { useEffect, useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Mail, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { platformAdminApi, type TenantRestaurant, type PageCatalogEntry } from './platformAdminApi';

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
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

export const TenantDirectoryPage: React.FC = () => {
  const [restaurants, setRestaurants] = useState<TenantRestaurant[]>([]);
  const [pages, setPages] = useState<PageCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([platformAdminApi.listRestaurants(), platformAdminApi.getPageCatalog()])
      .then(([r, p]) => {
        setRestaurants(r);
        setPages(p);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaved = (restaurantId: string, enabledPages: string[]) => {
    setRestaurants((prev) => prev.map((r) => (r.id === restaurantId ? { ...r, enabledPages } : r)));
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
                  <div className="flex items-center gap-3 shrink-0">
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
                {isOpen && <PageAccessEditor restaurant={r} pages={pages} onSaved={handleSaved} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
