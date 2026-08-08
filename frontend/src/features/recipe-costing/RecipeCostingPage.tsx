import React, { useEffect, useMemo, useState } from 'react';
import { ChefHat, RefreshCcw, ShieldAlert, TrendingUp } from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { CostedDish, MenuEngineeringClass, MenuEngineeringReport } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';

const CLASS_META: Record<Exclude<MenuEngineeringClass, null>, { label: string; color: string; desc: string }> = {
  star: { label: 'Star', color: 'var(--good, #10b981)', desc: 'High margin, high popularity. Protect these.' },
  puzzle: { label: 'Puzzle', color: '#f59e0b', desc: 'High margin, low popularity. Reposition or promote.' },
  'plow-horse': { label: 'Plow-horse', color: '#818cf8', desc: 'Popular but thin margin. Adjust price or portion.' },
  dog: { label: 'Dog', color: '#64748b', desc: 'Low margin, low popularity. Candidate to cut.' },
};

const CLASS_PILL_CLASSES: Record<Exclude<MenuEngineeringClass, null>, string> = {
  star: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  puzzle: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'plow-horse': 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
  dog: 'bg-slate-700/40 text-slate-400 border-slate-700',
};

function QuadrantChart({ dishes, medianUnitsSold, medianMargin }: { dishes: CostedDish[]; medianUnitsSold: number; medianMargin: number }) {
  const plottable = dishes.filter((d) => d.classification !== null && d.margin !== null);

  const left = 56, right = 440, top = 16, bottom = 260;
  const unitsValues = plottable.map((d) => d.unitsSold).concat([medianUnitsSold, 0]);
  const marginValues = plottable.map((d) => d.margin as number).concat([medianMargin]);

  const xMax = Math.max(1, ...unitsValues) * 1.1;
  const yMin = Math.min(0, ...marginValues) * 1.1;
  const yMax = Math.max(1, ...marginValues) * 1.1;

  const scaleX = (units: number) => left + (units / xMax) * (right - left);
  const scaleY = (margin: number) => bottom - ((margin - yMin) / (yMax - yMin)) * (bottom - top);

  const medianX = scaleX(medianUnitsSold);
  const medianY = scaleY(medianMargin);

  return (
    <svg viewBox="0 0 480 300" className="w-full h-auto">
      <line x1={left} y1={top} x2={left} y2={bottom} stroke="#1e293b" strokeWidth={1.5} />
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#1e293b" strokeWidth={1.5} />
      <line x1={medianX} y1={top} x2={medianX} y2={bottom} stroke="#334155" strokeDasharray="3 3" strokeWidth={1} />
      <line x1={left} y1={medianY} x2={right} y2={medianY} stroke="#334155" strokeDasharray="3 3" strokeWidth={1} />

      <text x={(medianX + right) / 2} y={top + 14} fontSize={9.5} fontWeight={800} fill="#94a3b8" textAnchor="middle" letterSpacing={0.5}>
        HIGH POPULARITY / HIGH MARGIN
      </text>
      <text x={right} y={bottom + 20} fontSize={10} fill="#64748b" textAnchor="end">
        Units sold →
      </text>
      <text x={left - 10} y={top + 10} fontSize={10} fill="#64748b" textAnchor="end">
        Margin ↑
      </text>

      {plottable.map((dish) => {
        const cx = scaleX(dish.unitsSold);
        const cy = scaleY(dish.margin as number);
        const color = CLASS_META[dish.classification as Exclude<MenuEngineeringClass, null>].color;
        return (
          <g key={dish.id}>
            <circle cx={cx} cy={cy} r={6} fill={color} />
            <text x={cx + 9} y={cy + 3} fontSize={10} fontWeight={700} fill="#e2e8f0">
              {dish.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const RecipeCostingPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canView = hasPermission('recipecosting.view');
  const [report, setReport] = useState<MenuEngineeringReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await posApi.getMenuEngineering(30);
      setReport(data);
    } catch (err) {
      console.error('Failed to load recipe costing report:', err);
      setError('Failed to load the recipe costing report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) loadReport();
    else setLoading(false);
  }, [canView]);

  const sortedDishes = useMemo(() => report?.dishes ?? [], [report]);

  if (!canView) {
    return (
      <div className="p-6 min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <ShieldAlert className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">Access restricted</p>
          <p className="text-xs text-slate-500 mt-1">Recipe costing exposes ingredient pricing and margins — ask an Owner to grant your role "View recipe costing & menu engineering" if you need this.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-indigo-400" /> Recipe Costing &amp; Menu Engineering
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Every dish's true ingredient cost, computed live from your recipes and current inventory pricing.
            {report && ` Last ${report.periodDays} days of sales.`}
          </p>
        </div>
        <button
          onClick={loadReport}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Recost with latest prices
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">{error}</div>
      )}

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-sm">Computing costs…</div>
      ) : !report || report.dishes.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm bg-slate-900 border border-slate-800 rounded-2xl">
          No menu items yet — add dishes with recipes to see cost analysis here.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Dishes analyzed</div>
              <div className="text-xl font-bold mt-1">{report.dishesAnalyzed}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Missing cost data</div>
              <div className="text-xl font-bold mt-1">{report.dishesMissingCostData}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Median units sold</div>
              <div className="text-xl font-bold mt-1">{report.medianUnitsSold}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Median margin</div>
              <div className="text-xl font-bold mt-1">Rs. {report.medianMargin.toFixed(0)}</div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-400" /> Menu engineering — popularity vs. margin
              </h3>
              <span className="text-[10px] text-slate-500">quadrants split at the median</span>
            </div>
            {report.dishes.filter((d) => d.classification !== null).length >= 2 ? (
              <>
                <QuadrantChart dishes={sortedDishes} medianUnitsSold={report.medianUnitsSold} medianMargin={report.medianMargin} />
                <div className="flex flex-wrap gap-2 mt-3">
                  {(Object.keys(CLASS_META) as Array<Exclude<MenuEngineeringClass, null>>).map((cls) => (
                    <span key={cls} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold ${CLASS_PILL_CLASSES[cls]}`}>
                      {CLASS_META[cls].label}: {CLASS_META[cls].desc}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">
                Not enough costed dishes yet to compare — add ingredient recipes to at least two menu items.
              </p>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800">
              <h3 className="text-xs font-bold">Dish-level cost breakdown</h3>
            </div>

            {/* Mobile: one card per dish */}
            <div className="sm:hidden divide-y divide-slate-800/80">
              {sortedDishes.map((dish) => (
                <div key={dish.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200 truncate">{dish.name}</span>
                    <span className="text-xs font-bold tabular-nums shrink-0">Rs. {dish.price.toFixed(0)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1 text-[10.5px] text-slate-400">
                    <span
                      style={{
                        color:
                          dish.foodCostPercent === null
                            ? undefined
                            : dish.foodCostPercent <= 30
                            ? '#10b981'
                            : dish.foodCostPercent <= 38
                            ? '#f59e0b'
                            : '#f43f5e',
                      }}
                    >
                      {dish.foodCostPercent !== null ? `${dish.foodCostPercent.toFixed(1)}% food cost` : 'No cost data'} · {dish.unitsSold} sold
                    </span>
                    {dish.classification && (
                      <span className={`shrink-0 inline-flex px-1.5 py-0.5 rounded-md border text-[9px] font-semibold ${CLASS_PILL_CLASSES[dish.classification]}`}>
                        {CLASS_META[dish.classification].label}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Tablet/desktop: full table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="text-left font-semibold px-5 py-3">Dish</th>
                    <th className="text-right font-semibold px-5 py-3">Price</th>
                    <th className="text-right font-semibold px-5 py-3">Ingredient cost</th>
                    <th className="text-right font-semibold px-5 py-3">Food cost %</th>
                    <th className="text-right font-semibold px-5 py-3">Units sold</th>
                    <th className="text-left font-semibold px-5 py-3">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {sortedDishes.map((dish) => (
                    <tr key={dish.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-5 py-3 font-semibold text-slate-200">{dish.name}</td>
                      <td className="px-5 py-3 text-right tabular-nums">Rs. {dish.price.toFixed(0)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-400">
                        {dish.ingredientCost !== null ? `Rs. ${dish.ingredientCost.toFixed(0)}` : '—'}
                      </td>
                      <td
                        className="px-5 py-3 text-right tabular-nums font-semibold"
                        style={{
                          color:
                            dish.foodCostPercent === null
                              ? undefined
                              : dish.foodCostPercent <= 30
                              ? '#10b981'
                              : dish.foodCostPercent <= 38
                              ? '#f59e0b'
                              : '#f43f5e',
                        }}
                      >
                        {dish.foodCostPercent !== null ? `${dish.foodCostPercent.toFixed(1)}%` : 'No recipe cost data'}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-400">{dish.unitsSold}</td>
                      <td className="px-5 py-3">
                        {dish.classification ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-semibold ${CLASS_PILL_CLASSES[dish.classification]}`}>
                            {CLASS_META[dish.classification].label}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-bold mb-3">Recent waste &amp; spoilage</h3>
            {report.wasteLog.length === 0 ? (
              <p className="text-xs text-slate-500">No manual stock deductions in the last {report.periodDays} days.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {report.wasteLog.map((entry) => (
                  <div key={entry.id} className="shrink-0 w-44 p-3 rounded-xl border border-slate-800 bg-slate-950">
                    <div className="text-xs font-bold text-slate-200">{entry.itemName}</div>
                    <div className="text-[10px] text-amber-400 font-semibold mt-1">{entry.reason}</div>
                    <div className="text-[10px] text-slate-500 mt-1.5 tabular-nums">
                      {entry.quantity}{entry.unit} · {entry.performedBy}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
