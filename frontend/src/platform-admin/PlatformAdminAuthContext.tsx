import React, { createContext, useCallback, useContext, useState } from 'react';

export interface PlatformAdminUser {
  id: string;
  name: string;
  email: string;
}

interface PlatformAdminAuthContextValue {
  currentAdmin: PlatformAdminUser | null;
  login: (admin: PlatformAdminUser, token: string) => void;
  logout: () => void;
}

const PlatformAdminAuthContext = createContext<PlatformAdminAuthContextValue | undefined>(undefined);

function readStoredAdmin(): PlatformAdminUser | null {
  const saved = localStorage.getItem('platformAdminUser');
  const token = localStorage.getItem('platformAdminToken');
  if (!saved || !token) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

// Isolated from AuthContext.tsx on purpose — different storage keys, no
// shared state, so a platform admin session and a tenant session can never
// bleed into each other in the same browser.
export const PlatformAdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentAdmin, setCurrentAdmin] = useState<PlatformAdminUser | null>(readStoredAdmin);

  const login = useCallback((admin: PlatformAdminUser, token: string) => {
    localStorage.setItem('platformAdminUser', JSON.stringify(admin));
    localStorage.setItem('platformAdminToken', token);
    setCurrentAdmin(admin);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('platformAdminUser');
    localStorage.removeItem('platformAdminToken');
    setCurrentAdmin(null);
  }, []);

  return (
    <PlatformAdminAuthContext.Provider value={{ currentAdmin, login, logout }}>
      {children}
    </PlatformAdminAuthContext.Provider>
  );
};

export function usePlatformAdminAuth(): PlatformAdminAuthContextValue {
  const ctx = useContext(PlatformAdminAuthContext);
  if (!ctx) throw new Error('usePlatformAdminAuth must be used within a PlatformAdminAuthProvider');
  return ctx;
}
