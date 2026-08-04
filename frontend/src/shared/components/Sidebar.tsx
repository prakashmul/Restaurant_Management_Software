import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  Utensils,
  Package,
  ShoppingBag,
  CreditCard,
  User,
  ChevronUp,
  LogIn,
  LogOut,
  ShieldCheck
} from 'lucide-react';

interface SidebarProps {
  currentUser?: {
    name: string;
    role: string;
  } | null;
  onLogin?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser = { name: 'Monster Dai', role: 'Owner' }, // Pass null if logged out
  onLogin,
  onLogout
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutGrid, end: true },
    { path: '/pos', label: 'POS System', icon: Utensils, end: false },
    { path: '/inventory', label: 'Inventory', icon: Package, end: false },
    { path: '/orders', label: 'Order History', icon: ShoppingBag, end: false },
    { path: '/credits', label: 'Credit Ledger', icon: CreditCard, end: false },
  ] as const;

  // Close popup menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between h-full select-none">
      {/* TOP SECTION: BRAND & NAV */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-xs">
            RMS
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-sm">Restaurant</h1>
            <p className="text-[10px] text-slate-400">Management Software</p>
          </div>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* BOTTOM SECTION: PROFILE BUTTON & POPUP MENU */}
      <div className="relative pt-4 border-t border-slate-800" ref={menuRef}>
        {/* POPUP MENU */}
        {isProfileOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-slate-950 border border-slate-800 rounded-xl p-1.5 shadow-xl backdrop-blur-lg z-50">
            {currentUser ? (
              <>
                <div className="px-3 py-2 border-b border-slate-800/80 mb-1">
                  <p className="text-xs font-bold text-slate-200">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <ShieldCheck className="w-3 h-3 text-indigo-400" />
                    {currentUser.role}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    if (onLogout) onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setIsProfileOpen(false);
                  if (onLogin) onLogin();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 transition"
              >
                <LogIn className="w-4 h-4" />
                Login
              </button>
            )}
          </div>
        )}

        {/* PROFILE BUTTON */}
        <button
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-800 transition group"
        >
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
              {currentUser ? currentUser.name.slice(0, 2).toUpperCase() : <User className="w-4 h-4" />}
            </div>

            <div className="text-left truncate">
              <h2 className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                {currentUser ? currentUser.name : 'Guest Account'}
              </h2>
              <p className="text-[10px] text-slate-400 truncate">
                {currentUser ? currentUser.role : 'Click to login'}
              </p>
            </div>
          </div>

          <ChevronUp
            className={`w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-transform duration-200 shrink-0 ${
              isProfileOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>
    </aside>
  );
};
