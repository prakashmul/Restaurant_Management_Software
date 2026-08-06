import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { posApi } from '../../api/posApi';
import type { Location } from '../../api/posApi';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || '';
  return initials.toUpperCase();
}

export const Header: React.FC = () => {
  const { currentUser, currentRestaurant, currentLocation, isLocationRestricted, setCurrentLocation } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);

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
    <header className="h-16 border-b border-slate-800 bg-slate-900/40 backdrop-blur px-6 flex items-center justify-between shrink-0">
      <div className='text-4xl text-extrabold'>
        <h1>{currentRestaurant?.name || 'Restaurant Management'}</h1>
      </div>

      <div className="flex items-center gap-4">
        {currentLocation && (
          <>
            {isLocationRestricted || locations.length <= 1 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 bg-slate-800/60 border border-slate-800 rounded-full px-3 py-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-400" /> {currentLocation.name}
              </span>
            ) : (
              <div className="relative">
                <select
                  value={currentLocation.id}
                  onChange={(e) => handleSwitch(e.target.value)}
                  className="appearance-none bg-slate-800/60 border border-slate-800 rounded-full pl-8 pr-8 py-1.5 text-xs font-semibold text-slate-200 cursor-pointer focus:outline-none focus:border-indigo-500"
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
            <div className="h-6 w-px bg-slate-800" />
          </>
        )}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-200 border border-slate-600">
            {currentUser ? getInitials(currentUser.name) : ''}
          </div>
          <div className="text-xs">
            <p className="font-semibold text-slate-200">{currentUser?.name || 'Guest'}</p>
            <p className="text-slate-400">{currentUser?.role || ''}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
