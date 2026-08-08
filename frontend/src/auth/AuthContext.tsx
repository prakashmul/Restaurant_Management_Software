import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { posApi } from '../api/posApi';

export interface AuthUser {
  name: string;
  email?: string;
  role: string;
  // Null = unrestricted (sees/acts across every location, e.g. Owner);
  // set = confined server-side to that one location regardless of what the
  // client requests.
  locationId?: string | null;
}

export interface AuthRestaurant {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  logoUrl?: string;
  currency?: string;
  taxRatePercent?: number;
  loyaltyEarnRatePerRs?: number;
  loyaltyPointValueRs?: number;
  geofence?: {
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
  };
}

export interface AuthLocation {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
  geofence?: {
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
  };
}

interface AuthContextValue {
  currentUser: AuthUser | null;
  currentRestaurant: AuthRestaurant | null;
  currentLocation: AuthLocation | null;
  isOwner: boolean;
  isLocationRestricted: boolean;
  // The current user's own role's granted permission keys — fetched once
  // after login (see AuthProvider). Owners always pass regardless of this
  // list, since the Owner role isn't user-editable and always has every
  // permission. This is a UI hint only; the backend is the real gate and
  // re-checks fresh on every request regardless of what this says.
  hasPermission: (key: string) => boolean;
  login: (user: AuthUser, token: string, restaurant?: AuthRestaurant | null) => void;
  setCurrentLocation: (location: AuthLocation | null) => void;
  updateRestaurant: (patch: Partial<AuthRestaurant>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// The token and profile always live together under these keys — this is
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

function readStoredRestaurant(): AuthRestaurant | null {
  const saved = localStorage.getItem('currentRestaurant');
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function readStoredLocation(): AuthLocation | null {
  const saved = localStorage.getItem('currentLocation');
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(readStoredUser);
  const [currentRestaurant, setCurrentRestaurant] = useState<AuthRestaurant | null>(readStoredRestaurant);
  const [currentLocation, setCurrentLocationState] = useState<AuthLocation | null>(readStoredLocation);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setPermissions([]);
      return;
    }
    let cancelled = false;
    posApi
      .getRoles()
      .then((roles) => {
        if (cancelled) return;
        const myRole = roles.find((r) => r.name === currentUser.role);
        setPermissions(myRole?.permissions || []);
      })
      .catch(() => {
        if (!cancelled) setPermissions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const login = useCallback((user: AuthUser, token: string, restaurant?: AuthRestaurant | null) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('authToken', token);
    setCurrentUser(user);

    if (restaurant) {
      localStorage.setItem('currentRestaurant', JSON.stringify(restaurant));
      setCurrentRestaurant(restaurant);
    } else {
      localStorage.removeItem('currentRestaurant');
      setCurrentRestaurant(null);
    }

    // A previously-selected location almost certainly doesn't belong to
    // whichever restaurant just logged in — the app picks a fresh default
    // once it has fetched that restaurant's location list.
    localStorage.removeItem('currentLocation');
    setCurrentLocationState(null);
  }, []);

  const setCurrentLocation = useCallback((location: AuthLocation | null) => {
    if (location) {
      localStorage.setItem('currentLocation', JSON.stringify(location));
    } else {
      localStorage.removeItem('currentLocation');
    }
    setCurrentLocationState(location);
  }, []);

  const updateRestaurant = useCallback((patch: Partial<AuthRestaurant>) => {
    setCurrentRestaurant((prev) => {
      const next = { ...(prev || {}), ...patch } as AuthRestaurant;
      localStorage.setItem('currentRestaurant', JSON.stringify(next));
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentRestaurant');
    localStorage.removeItem('currentLocation');
    setCurrentUser(null);
    setCurrentRestaurant(null);
    setCurrentLocationState(null);
  }, []);

  const isOwner = currentUser?.role?.toLowerCase() === 'owner';
  const isLocationRestricted = !!currentUser?.locationId;

  const hasPermission = useCallback(
    (key: string) => isOwner || permissions.includes(key),
    [isOwner, permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRestaurant,
        currentLocation,
        isOwner,
        isLocationRestricted,
        hasPermission,
        login,
        setCurrentLocation,
        updateRestaurant,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
