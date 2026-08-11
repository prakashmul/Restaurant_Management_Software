import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  LayoutGrid,
  Utensils,
  Flame,
  Package,
  ShoppingBag,
  CreditCard,
  Users,
  ChefHat,
  ClipboardCheck,
  CalendarClock,
  CalendarDays,
  Truck,
  History,
  Building2,
  MapPin,
  ArrowLeftRight,
  Users2,
  Settings,
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
  isOpen?: boolean;
  onClose?: () => void;
}

// Single source of truth for both the sidebar's visible entries and the
// route guard in App.tsx — a page with a `permission` value is hidden from
// the sidebar AND refuses to render directly by URL for a role lacking that
// key. Each key is its own dedicated page.* permission (editable per role
// from the "Page Access" section of Users & Roles → Roles & Permissions),
// separate from the finer per-action permissions that control what a role
// can DO once it's on a page it can see. `permission: null` means every
// logged-in role can always reach it — Dashboard hosts the shared shift
// clock and Checklists' daily prep list is intentionally open to all staff
// regardless of role (see checklistsRoutes.js), so neither has a page.* key
// at all; there's nothing to toggle.
export const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutGrid, end: true, permission: null },
  { path: '/pos', label: 'POS System', icon: Utensils, end: false, permission: 'page.pos' },
  { path: '/kitchen', label: 'Kitchen Display', icon: Flame, end: false, permission: 'page.kitchen' },
  { path: '/inventory', label: 'Inventory', icon: Package, end: false, permission: 'page.inventory' },
  { path: '/orders', label: 'Order History', icon: ShoppingBag, end: false, permission: 'page.orders' },
  { path: '/credits', label: 'Credit Ledger', icon: CreditCard, end: false, permission: 'page.credits' },
  { path: '/customers', label: 'Customers', icon: Users2, end: false, permission: 'page.customers' },
  { path: '/reservations', label: 'Reservations', icon: CalendarClock, end: false, permission: 'page.reservations' },
  { path: '/head-office', label: 'Head Office', icon: Building2, end: false, permission: 'page.headoffice' },
  { path: '/recipe-costing', label: 'Recipe Costing', icon: ChefHat, end: false, permission: 'page.recipecosting' },
  { path: '/checklists', label: 'Checklists', icon: ClipboardCheck, end: false, permission: null },
  { path: '/scheduling', label: 'Staff Schedule', icon: CalendarDays, end: false, permission: 'page.scheduling' },
  { path: '/procurement', label: 'Procurement', icon: Truck, end: false, permission: 'page.procurement' },
  { path: '/transfers', label: 'Transfers', icon: ArrowLeftRight, end: false, permission: 'page.transfers' },
  { path: '/staff', label: 'Users & Roles', icon: Users, end: false, permission: 'page.staff' },
  { path: '/locations', label: 'Locations', icon: MapPin, end: false, permission: 'page.locations' },
  { path: '/audit-log', label: 'Audit Log', icon: History, end: false, permission: 'page.auditlog' },
  { path: '/settings', label: 'Settings', icon: Settings, end: false, permission: 'page.settings' },
] as const;

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser = null,
  onLogin,
  onLogout,
  isOpen = false,
  onClose,
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { hasPermission, isOwner, permissionsLoaded } = useAuth();

  // Before the async permissions fetch resolves, show every item rather
  // than filtering down to the always-visible ones — avoids a flash of a
  // near-empty sidebar on load that then suddenly gains entries a moment
  // later. Owner never needs to wait, since hasPermission always passes.
  const navItems =
    isOwner || permissionsLoaded
      ? NAV_ITEMS.filter((item) => item.permission === null || hasPermission(item.permission))
      : NAV_ITEMS;

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
    <>
      {/* Backdrop — mobile/tablet only, dismisses the drawer on tap. The
          sidebar itself is a persistent flex sibling at lg+, where this
          never renders. */}
      {isOpen && (
        <div
          onClick={onClose}
          aria-hidden="true"
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col h-full select-none
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0 lg:z-auto lg:shrink-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
      {/* TOP SECTION: BRAND & NAV — scrolls independently so a long nav list never pushes the profile button off-screen */}
      <div className="flex-1 min-h-0 flex flex-col space-y-6 overflow-y-auto">
        <div className="flex items-center gap-3 px-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-xs">
            RMS
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-sm">Restaurant</h1>
            <p className="text-[10px] text-slate-400">Management Software</p>
          </div>
        </div>

        <nav className="space-y-1 pb-1">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={onClose}
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

      {/* BOTTOM SECTION: PROFILE BUTTON & POPUP MENU — always visible, never scrolls away */}
      <div className="relative pt-4 border-t border-slate-800 shrink-0" ref={menuRef}>
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
    </>
  );
};
