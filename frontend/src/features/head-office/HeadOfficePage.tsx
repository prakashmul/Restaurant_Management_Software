import React, { useEffect, useMemo, useState } from 'react';
import { Building2, TrendingUp, TrendingDown, ShieldAlert } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { HeadOfficeLocationSummary } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { LocationTrendChart } from './LocationTrendChart';

const STATUS_META: Record<HeadOfficeLocationSummary['foodCostStatus'], { label: string; classes: string }> = {
  good: { label: 'On target', classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  watch: { label: 'Watch', classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  bad: { label: 'Needs attention', classes: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  unknown: { label: 'No cost data', classes: 'bg-slate-700/40 text-slate-400 border-slate-700' },
};

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="grid grid-cols-[90px_1fr_70px] items-center gap-2.5">
      <span className="text-[11px] text-slate-400 font-semibold truncate">{label}</span>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-bold text-right tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

export const HeadOfficePage: React.FC = () => {
  const { isOwner } = useAuth();
  const [locations, setLocations] = useState<HeadOfficeLocationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSummary = async () => {
    try {
      const data = await posApi.getHeadOfficeSummary();
      setLocations(data.locations);
    } catch (err) {
      console.error('Failed to load head office summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner) loadSummary();
    else setLoading(false);
  }, [isOwner]);

  const ranked = useMemo(
    () => [...locations].sort((a, b) => (b.foodCostPercent ?? -1) - (a.foodCostPercent ?? -1)),
    [locations]
  );
  const maxSales7d = Math.max(1, ...locations.map((l) => l.sales7d));
  const maxLaborHours = Math.max(1, ...locations.map((l) => l.laborHours7d));

  if (!isOwner) {
    return (
      <div className="p-6 min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Owner access only</p>
          <p className="text-xs text-slate-500 mt-1">Head Office aggregates sales and cost data across every location, so only Owners can view it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div>
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-400" /> Head Office
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Every location, one screen. See where the business needs attention.
        </p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Loading summary…</div>
      ) : locations.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-2xl">
          No locations yet.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {locations.map((loc) => {
              const status = STATUS_META[loc.foodCostStatus];
              return (
                <div key={loc.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-sm font-bold text-slate-100">{loc.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{loc.address || 'No address set'}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${status.classes}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Today's Sales</div>
                      <div className="text-base font-bold mt-0.5 tabular-nums">Rs. {loc.todaySales.toFixed(0)}</div>
                    </div>
                    <div>
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Food Cost</div>
                      <div className="text-base font-bold mt-0.5 tabular-nums">
                        {loc.foodCostPercent !== null ? `${loc.foodCostPercent.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Labor Hours (7d)</div>
                      <div className="text-base font-bold mt-0.5 tabular-nums">{loc.laborHours7d}</div>
                    </div>
                    <div>
                      <div className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">Credit Exposure</div>
                      <div className="text-base font-bold mt-0.5 tabular-nums">Rs. {loc.creditExposure.toFixed(0)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <LocationTrendChart locations={locations} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-bold mb-4 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Sales — last 7 days
              </h3>
              <div className="space-y-3">
                {locations.map((loc) => (
                  <Bar key={loc.id} label={loc.name} value={Math.round(loc.sales7d)} max={maxSales7d} color="#818cf8" />
                ))}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-xs font-bold mb-4">Labor hours — last 7 days</h3>
              <div className="space-y-3">
                {locations.map((loc) => (
                  <Bar key={loc.id} label={loc.name} value={loc.laborHours7d} max={maxLaborHours} color="#f59e0b" />
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xs font-bold">Location ranking — sorted by food cost %, worst first</h3>
            </div>

            {/* Mobile/tablet: one card per location */}
            <div className="lg:hidden divide-y divide-slate-800/80">
              {ranked.map((loc) => (
                <div key={loc.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200 truncate">{loc.name}</span>
                    <span
                      className="text-xs font-bold tabular-nums shrink-0"
                      style={{
                        color:
                          loc.foodCostStatus === 'good' ? '#10b981' : loc.foodCostStatus === 'watch' ? '#f59e0b' : loc.foodCostStatus === 'bad' ? '#f43f5e' : undefined,
                      }}
                    >
                      {loc.foodCostPercent !== null ? `${loc.foodCostPercent.toFixed(1)}% food cost` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1 text-[10.5px] text-slate-400">
                    <span>Rs. {loc.sales7d.toFixed(0)} sales · {loc.laborHours7d}h labor</span>
                    {loc.salesTrendPercent !== null && (
                      <span className={`inline-flex items-center gap-1 font-bold shrink-0 ${loc.salesTrendPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {loc.salesTrendPercent >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {Math.abs(loc.salesTrendPercent).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: full table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="text-left font-semibold px-5 py-3">Location</th>
                    <th className="text-right font-semibold px-5 py-3">Sales (7d)</th>
                    <th className="text-right font-semibold px-5 py-3">Food cost</th>
                    <th className="text-right font-semibold px-5 py-3">Labor hours</th>
                    <th className="text-right font-semibold px-5 py-3">Credit owed</th>
                    <th className="text-left font-semibold px-5 py-3">7-day trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {ranked.map((loc) => (
                    <tr key={loc.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-5 py-3 font-semibold text-slate-200">{loc.name}</td>
                      <td className="px-5 py-3 text-right tabular-nums">Rs. {loc.sales7d.toFixed(0)}</td>
                      <td
                        className="px-5 py-3 text-right tabular-nums font-semibold"
                        style={{
                          color:
                            loc.foodCostStatus === 'good' ? '#10b981' : loc.foodCostStatus === 'watch' ? '#f59e0b' : loc.foodCostStatus === 'bad' ? '#f43f5e' : undefined,
                        }}
                      >
                        {loc.foodCostPercent !== null ? `${loc.foodCostPercent.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-400">{loc.laborHours7d}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-400">Rs. {loc.creditExposure.toFixed(0)}</td>
                      <td className="px-5 py-3">
                        {loc.salesTrendPercent === null ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${loc.salesTrendPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {loc.salesTrendPercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            Sales {loc.salesTrendPercent >= 0 ? 'up' : 'down'} {Math.abs(loc.salesTrendPercent).toFixed(0)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
