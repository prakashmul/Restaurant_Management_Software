import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PosPage } from '../features/pos/PosPage';
import { InventoryPage } from '../features/inventory/InventoryPage';
import { Sidebar } from '../shared/components/Sidebar';
import { Header } from '../shared/components/Header';
import { OrdersPage } from '../features/orders/OrdersPage';
import { CreditLedgerPage } from '../features/credits/CreditLedgerPage';
import { LoginModal } from '../auth/LoginModal';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { AuthProvider, useAuth } from '../auth/AuthContext';

function AppShell() {
  const { currentUser, login, logout } = useAuth();

  // Open modal automatically on initial load if no user session exists
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(!currentUser);

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
          onLoginSuccess={(user, token) => {
            login(user, token);
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
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/credits" element={<CreditLedgerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* Login Modal for manually switching accounts */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={(user, token) => {
          login(user, token);
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
