import { useState } from 'react';
import { PosPage } from './pages/PosPage';
import { InventoryPage } from './pages/InventoryPage';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OrdersPage } from './pages/OrdersPage';
import { CreditLedgerPage } from './pages/CreditLedgerPage';
import { LoginModal } from './components/LoginModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<'pos' | 'inventory' | 'orders' | 'dashboard' | 'credits'>('pos');

  // Load initial session
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(() => {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  });

  // Open modal automatically on initial load if no user session exists
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(!currentUser);

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
    setIsLoginOpen(true); // Re-open login modal on logout
  };

  // If user is not logged in, render ONLY the LoginModal backdrop
  if (!currentUser) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <LoginModal
          isOpen={true}
          // Prevent closing by clicking backdrop/X if unauthenticated
          onClose={() => {}} 
          onLoginSuccess={(user) => {
            setCurrentUser(user);
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
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'pos' && <PosPage />}
          {activeTab === 'inventory' && <InventoryPage />}
          {activeTab === 'orders' && <OrdersPage />}
          {activeTab === 'dashboard' && (
            <div className="p-6 text-slate-400">Dashboard Page (Coming Soon)</div>
          )}
          {activeTab === 'credits' && <CreditLedgerPage />}
        </main>
      </div>

      {/* Login Modal for manually switching accounts */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setIsLoginOpen(false);
        }}
      />
    </div>
  );
}