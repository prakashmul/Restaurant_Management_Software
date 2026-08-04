import React, { createContext, useCallback, useContext, useState } from 'react';

export interface AuthUser {
  name: string;
  email?: string;
  role: string;
}

interface AuthContextValue {
  currentUser: AuthUser | null;
  isOwner: boolean;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The token and profile always live together under these two keys — this is
// the single place that reads/writes them, replacing the four different
// ad hoc localStorage-key-guessing implementations that used to exist.
function readStoredUser(): AuthUser | null {
  const saved = localStorage.getItem('currentUser');
  const token = localStorage.getItem('authToken');
  if (!saved || !token) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(readStoredUser);

  const login = useCallback((user: AuthUser, token: string) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('authToken', token);
    setCurrentUser(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    setCurrentUser(null);
  }, []);

  const isOwner = currentUser?.role?.toLowerCase() === 'owner';

  return (
    <AuthContext.Provider value={{ currentUser, isOwner, login, logout }}>{children}</AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
