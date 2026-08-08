import React, { useEffect, useState } from 'react';
import { Menu, MapPin, WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { posApi } from '../../api/posApi';
import type { Location } from '../../api/posApi';
import { useOfflineQueueContext } from '../../offline/OfflineQueueContext';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || '';
  return initials.toUpperCase();
}

interface HeaderProps {
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { currentUser, currentRestaurant, currentLocation, isLocationRestricted, setCurrentLocation } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const { isOnline, pendingCount } = useOfflineQueueContext();

  useEffect(() => {
    if (isLocationRestricted) return;
    posApi
      .getLocations()
      .then(setLocations)
      .catch((err) => console.error('Failed to load locations:', err));
  }, [isLocationRestricted, currentLocation?.id]);

  const handleSwitch = (locationId: string) => {
    const chosen = locations.find((l) => l._id === locationId);
    if (!chosen) return;
    setCurrentLocation({
      id: chosen._id,
      name: chosen.name,
      address: chosen.address,
      phone: chosen.phone,
      isActive: chosen.isActive,
      geofence: chosen.geofence,
    });
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/40 backdrop-blur px-3 sm:px-6 flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 -ml-1 shrink-0 rounded-lg text-slate-300 hover:bg-slate-800/60 hover:text-white transition"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-2xl lg:text-4xl font-extrabold truncate">
            {currentRestaurant?.name || 'Restaurant Management'}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {!isOnline ? (
          <span
            title="No connection — orders and payments are being saved on this device and will sync automatically once you're back online."
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-2.5 sm:px-3 py-1.5"
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Offline{pendingCount > 0 ? ` · ${pendingCount} to sync` : ''}</span>
          </span>
        ) : pendingCount > 0 ? (
          <span
            title="Back online — syncing what was saved while you were offline."
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 sm:px-3 py-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span className="hidden sm:inline">Syncing {pendingCount}</span>
          </span>
        ) : null}
        {currentLocation && (
          <>
            {isLocationRestricted || locations.length <= 1 ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 bg-slate-800/60 border border-slate-800 rounded-full px-3 py-1.5 max-w-[9rem] md:max-w-none truncate">
                <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> <span className="truncate">{currentLocation.name}</span>
              </span>
            ) : (
              <div className="relative hidden sm:block">
                <select
                  value={currentLocation.id}
                  onChange={(e) => handleSwitch(e.target.value)}
                  className="appearance-none bg-slate-800/60 border border-slate-800 rounded-full pl-8 pr-8 py-1.5 text-xs font-semibold text-slate-200 cursor-pointer focus:outline-none focus:border-indigo-500 max-w-[9rem] md:max-w-none"
                >
                  {locations.map((loc) => (
                    <option key={loc._id} value={loc._id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
                <MapPin className="w-3.5 h-3.5 text-indigo-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
            <div className="hidden sm:block h-6 w-px bg-slate-800" />
          </>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-200 border border-slate-600 shrink-0">
            {currentUser ? getInitials(currentUser.name) : ''}
          </div>
          <div className="text-xs hidden sm:block">
            <p className="font-semibold text-slate-200">{currentUser?.name || 'Guest'}</p>
            <p className="text-slate-400">{currentUser?.role || ''}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
