import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PosPage } from '../features/pos/PosPage';
import { KitchenDisplayPage } from '../features/kitchen/KitchenDisplayPage';
import { ReservationsPage } from '../features/reservations/ReservationsPage';
import { InventoryPage } from '../features/inventory/InventoryPage';
import { Sidebar } from '../shared/components/Sidebar';
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
import { LoginModal } from '../auth/LoginModal';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { posApi } from '../api/posApi';

function AppShell() {
  const { currentUser, currentLocation, setCurrentLocation, login, logout } = useAuth();

  // Open modal automatically on initial load if no user session exists
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(!currentUser);

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
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/pos" element={<PosPage />} />
            <Route path="/kitchen" element={<KitchenDisplayPage />} />
            <Route path="/reservations" element={<ReservationsPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/credits" element={<CreditLedgerPage />} />
            <Route path="/staff" element={<StaffPage />} />
            <Route path="/recipe-costing" element={<RecipeCostingPage />} />
            <Route path="/checklists" element={<ChecklistsPage />} />
            <Route path="/scheduling" element={<SchedulingPage />} />
            <Route path="/procurement" element={<ProcurementPage />} />
            <Route path="/transfers" element={<TransfersPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="/locations" element={<LocationsPage />} />
            <Route path="/head-office" element={<HeadOfficePage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
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
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  );
}
