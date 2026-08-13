import React, { useState } from 'react';
import { ShieldCheck, Building2, Users2, Layers, LogOut } from 'lucide-react';
import { usePlatformAdminAuth } from './PlatformAdminAuthContext';
import { TenantDirectoryPage } from './TenantDirectoryPage';
import { ManageAdminsPage } from './ManageAdminsPage';
import { PlansPage } from './PlansPage';

type Tab = 'restaurants' | 'plans' | 'admins';

// Deliberately its own top-level layout — no Sidebar, no react-router
// Routes — this console is a separate small tool the project owner reaches
// by logging in with a different kind of account (see App.tsx's AppShell,
// which renders this instead of the normal tenant shell once a platform
// admin session exists), not a page inside the tenant app.
export const AdminConsoleApp: React.FC = () => {
  const { currentAdmin, logout } = usePlatformAdminAuth();
  const [tab, setTab] = useState<Tab>('restaurants');

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: 'restaurants', label: 'Restaurants', icon: Building2 },
    { key: 'plans', label: 'Plans', icon: Layers },
    { key: 'admins', label: 'Admins', icon: Users2 },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-100 truncate">Platform Admin Console</h1>
              <p className="text-[11px] text-slate-500 truncate">{currentAdmin?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 px-3 py-2 rounded-lg transition shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </header>

      <nav className="border-b border-slate-800 bg-slate-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-1">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition ${
                  active
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'restaurants' && <TenantDirectoryPage />}
        {tab === 'plans' && <PlansPage />}
        {tab === 'admins' && <ManageAdminsPage />}
      </main>
    </div>
  );
};
