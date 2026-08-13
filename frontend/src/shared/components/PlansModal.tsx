import React, { useEffect, useState } from 'react';
import { X, Layers, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { posApi, type SubscriptionPlan } from '../../api/posApi';
import { WhatsAppIcon } from './WhatsAppIcon';
import { NAV_ITEMS } from './Sidebar';

const WHATSAPP_NUMBER = '9779823011459';

// Reuses the same page.* -> human label mapping the sidebar itself renders
// from, so a plan's page list shows "POS System" rather than "page.pos".
const PAGE_LABELS = new Map(NAV_ITEMS.map((item) => [item.permission, item.label]));
function pageLabel(key: string): string {
  return PAGE_LABELS.get(key as any) || key;
}

function buildPlanRequestText(restaurantName: string | undefined, planName: string): string {
  return [
    'Restaurant Management Software — Plan Request',
    restaurantName ? `Restaurant: ${restaurantName}` : null,
    `Interested in: ${planName} plan`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

interface PlansModalProps {
  onClose: () => void;
}

// Everything here — names, prices, which pages each tier includes — comes
// from GET /api/plans, which reads straight from the Plan collection the
// Platform Admin Console's Plans tab edits. Nothing about a plan is
// hardcoded on the frontend; edit a plan there and this modal reflects it
// on its next load, for every restaurant, with no code change or deploy.
export const PlansModal: React.FC<PlansModalProps> = ({ onClose }) => {
  const { currentRestaurant } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  useEffect(() => {
    posApi
      .listPlans()
      .then((p) => setPlans([...p].sort((a, b) => a.sortOrder - b.sortOrder)))
      .catch((err) => {
        console.error('Failed to load plans:', err);
        setLoadError(err?.response?.data?.message || err?.message || 'Failed to load plans.');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRequestPlan = (planName: string) => {
    const text = buildPlanRequestText(currentRestaurant?.name, planName);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Position-based, not name-based — highlighting a specific plan by name
  // (e.g. always "Growth") would break the moment an admin renames or
  // reorders plans. The middle tier of a 3+ plan lineup is a reasonable,
  // name-agnostic stand-in for "most restaurants land here".
  const featuredIndex = plans.length >= 3 ? Math.floor(plans.length / 2) : -1;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-950/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-100">Choose your plan</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Switch anytime — your data and history are never affected by a plan change.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-xl transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : loadError ? (
            <div className="text-center py-16 text-rose-400 text-xs">Couldn't load plans: {loadError}</div>
          ) : plans.length === 0 ? (
            <div className="text-center py-16 text-slate-500 text-xs">
              No plans are set up yet — add one from the Platform Admin Console's Plans tab.
            </div>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <div className="inline-flex bg-slate-950 border border-slate-800 rounded-full p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setBillingCycle('monthly')}
                    className={`px-4 py-1.5 rounded-full font-semibold transition ${
                      billingCycle === 'monthly' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingCycle('annual')}
                    className={`px-4 py-1.5 rounded-full font-semibold transition ${
                      billingCycle === 'annual' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Annual
                  </button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan, idx) => {
                  const isCurrent = !!currentRestaurant?.planName && currentRestaurant.planName === plan.name;
                  const isFeatured = idx === featuredIndex && !isCurrent;
                  const isLast = idx === plans.length - 1;
                  const previousPlan = idx > 0 ? plans[idx - 1] : null;
                  const newPages = previousPlan ? plan.pages.filter((p) => !previousPlan.pages.includes(p)) : plan.pages;

                  const price = billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly;
                  const savingsPercent =
                    billingCycle === 'annual' && plan.priceMonthly > 0
                      ? Math.round((1 - plan.priceAnnual / (plan.priceMonthly * 12)) * 100)
                      : 0;

                  return (
                    <div
                      key={plan.id}
                      className={`relative flex flex-col gap-3 bg-slate-950 border rounded-2xl p-5 ${
                        isCurrent
                          ? 'border-indigo-500 ring-1 ring-indigo-500/40'
                          : isFeatured
                          ? 'border-indigo-500/60'
                          : 'border-slate-800'
                      }`}
                    >
                      {isCurrent ? (
                        <span className="absolute -top-2.5 left-5 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full">
                          Current Plan
                        </span>
                      ) : isFeatured ? (
                        <span className="absolute -top-2.5 left-5 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full">
                          Most restaurants land here
                        </span>
                      ) : null}

                      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{plan.name}</div>

                      <div>
                        <span className="text-2xl font-black font-mono text-slate-100">Rs. {price.toLocaleString()}</span>
                        <span className="text-xs text-slate-500 ml-1">
                          / {billingCycle === 'annual' ? 'yr' : 'mo'}
                          {plan.perLocationPrice > 0 && ' + per location'}
                        </span>
                        {savingsPercent > 0 && (
                          <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">Save ~{savingsPercent}% vs. monthly</p>
                        )}
                      </div>

                      <ul className="space-y-1.5 text-xs text-slate-300 flex-1">
                        {previousPlan && (
                          <li className="flex items-start gap-1.5 text-slate-400">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            Everything in {previousPlan.name}
                          </li>
                        )}
                        {newPages.map((key) => (
                          <li key={key} className="flex items-start gap-1.5">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            {pageLabel(key)}
                          </li>
                        ))}
                      </ul>

                      {isCurrent ? (
                        <button
                          type="button"
                          disabled
                          className="w-full py-2.5 bg-slate-800 text-slate-400 font-bold text-xs rounded-xl cursor-default"
                        >
                          Current Plan
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestPlan(plan.name)}
                          className={`w-full inline-flex items-center justify-center gap-2 font-bold text-xs py-2.5 rounded-xl transition ${
                            isFeatured
                              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5" />
                          {isLast ? 'Talk to Sales' : `Request ${plan.name}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
