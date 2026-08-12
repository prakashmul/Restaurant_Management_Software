import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PosPage } from '../features/pos/PosPage';
import { KitchenDisplayPage } from '../features/kitchen/KitchenDisplayPage';
import { ReservationsPage } from '../features/reservations/ReservationsPage';
import { InventoryPage } from '../features/inventory/InventoryPage';
import { Sidebar, NAV_ITEMS } from '../shared/components/Sidebar';
import { Header } from '../shared/components/Header';
import { OrdersPage } from '../features/orders/OrdersPage';
import { CreditLedgerPage } from '../features/credits/CreditLedgerPage';
import { StaffPage } from '../features/staff/StaffPage';
import { RecipeCostingPage } from '../features/recipe-costing/RecipeCostingPage';
import { ChecklistsPage } from '../features/checklists/ChecklistsPage';
import { SchedulingPage } from '../features/scheduling/SchedulingPage';
import { ProcurementPage } from '../features/procurement/ProcurementPage';
import { AuditLogPage } from '../features/audit-log/AuditLogPage';
import { LocationsPage } from '../features/locations/LocationsPage';
import { HeadOfficePage } from '../features/head-office/HeadOfficePage';
import { TransfersPage } from '../features/transfers/TransfersPage';
import { CustomersPage } from '../features/customers/CustomersPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ExpensesPage } from '../features/expenses/ExpensesPage';
import { LoginModal } from '../auth/LoginModal';
import { ResetPasswordPage } from '../auth/ResetPasswordPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { OfflineQueueProvider } from '../offline/OfflineQueueContext';
import { posApi } from '../api/posApi';
import { PlatformAdminAuthProvider, usePlatformAdminAuth } from '../platform-admin/PlatformAdminAuthContext';
import { AdminConsoleApp } from '../platform-admin/AdminConsoleApp';
import { SetAdminPasswordPage } from '../platform-admin/SetAdminPasswordPage';

// Same permission map the sidebar filters its entries by (see NAV_ITEMS in
// Sidebar.tsx) — reused here so a role without a page's permission can't
// reach it by typing the URL either, not just by it being hidden from nav.
const PERMISSION_BY_PATH = new Map<string, string | null>(NAV_ITEMS.map((item) => [item.path, item.permission]));

function PageGuard({ path, children }: { path: string; children: ReactNode }) {
  const { hasPermission, isOwner, permissionsLoaded, currentRestaurant } = useAuth();
  const permission = PERMISSION_BY_PATH.get(path);
  if (!permission) return <>{children}</>;
  // Wait for the async permissions fetch (Owner never needs it, since
  // hasPermission always passes for Owner) before deciding to redirect —
  // otherwise a hard refresh on a page the user genuinely has access to
  // would briefly look unpermitted and bounce them to the dashboard.
  if (!isOwner && !permissionsLoaded) return null;
  if (!hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }
  // Same AND-gate as Sidebar.tsx's NAV_ITEMS filter, applied at the route
  // level too so a disabled page can't be reached by typing the URL either.
  if (currentRestaurant?.enabledPages && !currentRestaurant.enabledPages.includes(permission)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function AppShell() {
  const { currentUser, currentLocation, setCurrentLocation, login, logout } = useAuth();
  const { currentAdmin, login: platformAdminLogin } = usePlatformAdminAuth();
  const location = useLocation();

  // Open modal automatically on initial load if no user session exists
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(!currentUser);

  // Sidebar renders as a persistent column at lg+ and an overlay drawer
  // below it; this only controls the drawer's open/closed state on small
  // screens (CSS handles the split, see Sidebar.tsx).
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close the drawer on every navigation, including programmatic redirects
  // (e.g. the catch-all `Navigate` route) that wouldn't hit the NavLink's
  // own onClick handler.
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Once logged in, pick a starting location: a restricted staff member's
  // own assigned location, or the first location for everyone else. Runs
  // again after logout/login since currentLocation is cleared on both.
  useEffect(() => {
    if (!currentUser || currentLocation) return;
    let cancelled = false;

    posApi
      .getLocations()
      .then((locations) => {
        if (cancelled || locations.length === 0) return;
        const assigned = currentUser.locationId
          ? locations.find((l) => l._id === currentUser.locationId)
          : null;
        const chosen = assigned || locations[0];
        setCurrentLocation({
          id: chosen._id,
          name: chosen.name,
          address: chosen.address,
          phone: chosen.phone,
          currency: chosen.currency,
          isActive: chosen.isActive,
          geofence: chosen.geofence,
        });
      })
      .catch((err) => console.error('Failed to load locations:', err));

    return () => {
      cancelled = true;
    };
  }, [currentUser, currentLocation, setCurrentLocation]);

  // Handle Logout
  const handleLogout = () => {
    logout();
    setIsLoginOpen(true); // Re-open login modal on logout
  };

  // Reachable regardless of login state — a set-password/reset link from an
  // email must work whether or not this browser already has a session.
  if (location.pathname === '/reset-password') {
    return <ResetPasswordPage />;
  }
  if (location.pathname === '/platform-admin/set-password') {
    return <SetAdminPasswordPage />;
  }

  // A platform admin isn't a restaurant user at all — same login form (see
  // onPlatformAdminLoginSuccess below), but once that session exists it
  // renders the console instead of the tenant shell, regardless of whether
  // a tenant session also happens to exist in this browser.
  if (currentAdmin) {
    return <AdminConsoleApp />;
  }

  // If user is not logged in, render ONLY the LoginModal backdrop
  if (!currentUser) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <LoginModal
          isOpen={true}
          // Prevent closing by clicking backdrop/X if unauthenticated
          onClose={() => { }}
          onLoginSuccess={(user, token, restaurant) => {
            login(user, token, restaurant);
            setIsLoginOpen(false);
          }}
          onPlatformAdminLoginSuccess={(admin, token) => {
            platformAdminLogin(admin, token);
          }}
        />
      </div>
    );
  }

  // Render normal layout once authenticated
  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        currentUser={currentUser}
        onLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header onMenuClick={() => setIsSidebarOpen(true)} />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/pos" element={<PageGuard path="/pos"><PosPage /></PageGuard>} />
            <Route path="/kitchen" element={<PageGuard path="/kitchen"><KitchenDisplayPage /></PageGuard>} />
            <Route path="/reservations" element={<PageGuard path="/reservations"><ReservationsPage /></PageGuard>} />
            <Route path="/inventory" element={<PageGuard path="/inventory"><InventoryPage /></PageGuard>} />
            <Route path="/orders" element={<PageGuard path="/orders"><OrdersPage /></PageGuard>} />
            <Route path="/credits" element={<PageGuard path="/credits"><CreditLedgerPage /></PageGuard>} />
            <Route path="/staff" element={<PageGuard path="/staff"><StaffPage /></PageGuard>} />
            <Route path="/recipe-costing" element={<PageGuard path="/recipe-costing"><RecipeCostingPage /></PageGuard>} />
            <Route path="/checklists" element={<ChecklistsPage />} />
            <Route path="/scheduling" element={<PageGuard path="/scheduling"><SchedulingPage /></PageGuard>} />
            <Route path="/procurement" element={<PageGuard path="/procurement"><ProcurementPage /></PageGuard>} />
            <Route path="/transfers" element={<PageGuard path="/transfers"><TransfersPage /></PageGuard>} />
            <Route path="/audit-log" element={<PageGuard path="/audit-log"><AuditLogPage /></PageGuard>} />
            <Route path="/expenses" element={<PageGuard path="/expenses"><ExpensesPage /></PageGuard>} />
            <Route path="/locations" element={<PageGuard path="/locations"><LocationsPage /></PageGuard>} />
            <Route path="/head-office" element={<PageGuard path="/head-office"><HeadOfficePage /></PageGuard>} />
            <Route path="/customers" element={<PageGuard path="/customers"><CustomersPage /></PageGuard>} />
            <Route path="/settings" element={<PageGuard path="/settings"><SettingsPage /></PageGuard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* Login Modal for manually switching accounts */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={(user, token, restaurant) => {
          login(user, token, restaurant);
          setIsLoginOpen(false);
        }}
        onPlatformAdminLoginSuccess={(admin, token) => {
          platformAdminLogin(admin, token);
          setIsLoginOpen(false);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlatformAdminAuthProvider>
        <OfflineQueueProvider>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </OfflineQueueProvider>
      </PlatformAdminAuthProvider>
    </AuthProvider>
  );
}
