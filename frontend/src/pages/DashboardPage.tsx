import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapPin, Clock, History, CheckCircle2, XCircle } from 'lucide-react';
import { posApi } from '../api/posApi';

const RESTAURANT_LOCATION = {
  latitude: 27.694147,
  longitude: 85.269939,
};

const ALLOWED_RADIUS_METERS = 300;
const STORAGE_KEY = 'pos_active_shift_session';

const calculateDistanceInMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

interface AttendanceRecord {
  _id?: string;
  id?: string;
  employeeName: string;
  checkInTime: string;
  checkOutTime: string | null;
  duration: string;
  status: 'Completed' | 'Auto-Checked Out' | 'Active';
}

export const DashboardPage: React.FC = () => {
  const currentUser = useMemo(() => {
    const possibleKeys = ['user', 'currentUser', 'authUser', 'username', 'profile', 'session', 'userData'];

    for (const key of possibleKeys) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const name = parsed.name || parsed.username || parsed.fullName || parsed.displayName || parsed.email || parsed.user?.name;
          if (name) return name;
        } catch (_e) {
          if (typeof stored === 'string' && stored.trim().length > 0) {
            return stored.replace(/^"|"$/g, '');
          }
        }
      }
    }
    return 'Current Employee';
  }, []);

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [userDistance, setUserDistance] = useState<number | null>(null);
  const [isInRange, setIsInRange] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [activeSessionStart, setActiveSessionStart] = useState<Date | null>(null);
  const activeSessionStartRef = useRef<Date | null>(null);
  const isCheckedInRef = useRef<boolean>(false);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);

  // Keep refs synchronized with state
  useEffect(() => {
    activeSessionStartRef.current = activeSessionStart;
  }, [activeSessionStart]);

  useEffect(() => {
    isCheckedInRef.current = isCheckedIn;
  }, [isCheckedIn]);

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const loadHistory = async () => {
    try {
      const data = await posApi.fetchAttendanceHistory();
      if (Array.isArray(data)) {
        setAttendanceHistory(data);
      }
    } catch (err) {
      console.error('Failed to load attendance history', err);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleCheckOut = useCallback(async (
    statusReason: 'Completed' | 'Auto-Checked Out' = 'Completed',
    customCheckoutTime?: Date
  ) => {
    const storedSession = localStorage.getItem(STORAGE_KEY);
    let sessionStart = activeSessionStartRef.current || activeSessionStart;

    if (!sessionStart && storedSession) {
      try {
        sessionStart = new Date(JSON.parse(storedSession).startTime);
      } catch (err) {
        console.error('Error parsing stored session on checkout', err);
      }
    }

    // Clear session state and storage immediately
    setIsCheckedIn(false);
    isCheckedInRef.current = false;
    localStorage.removeItem(STORAGE_KEY);

    const now = customCheckoutTime || new Date();

    if (sessionStart) {
      const effectiveCheckout = now < sessionStart ? sessionStart : now;
      const totalDurationSecs = Math.max(0, Math.floor((effectiveCheckout.getTime() - sessionStart.getTime()) / 1000));

      const payload: AttendanceRecord = {
        employeeName: currentUser,
        checkInTime: sessionStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        checkOutTime: effectiveCheckout.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: formatTime(totalDurationSecs),
        status: statusReason,
      };

      const tempRecord = { ...payload, id: `temp-${Date.now()}` };
      setAttendanceHistory((prev) => [tempRecord, ...prev]);

      try {
        await posApi.saveAttendanceRecord(payload);
        await loadHistory();
      } catch (err) {
        console.error('Failed to save record to backend database', err);
      }
    }

    setActiveSessionStart(null);
    activeSessionStartRef.current = null;
    setElapsedSeconds(0);
  }, [activeSessionStart, currentUser]);

  // Evaluate geolocation position
  const evaluateLocation = useCallback((position: GeolocationPosition) => {
    setGeoError(null);
    const { latitude, longitude } = position.coords;
    const timestamp = position.timestamp; // Corrected: timestamp is on GeolocationPosition

    const distance = calculateDistanceInMeters(
      latitude,
      longitude,
      RESTAURANT_LOCATION.latitude,
      RESTAURANT_LOCATION.longitude
    );

    const distRounded = Math.round(distance);
    setUserDistance(distRounded);
    const insideRadius = distance <= ALLOWED_RADIUS_METERS;
    setIsInRange(insideRadius);

    const hasActiveSession = isCheckedInRef.current || !!localStorage.getItem(STORAGE_KEY);
    
    if (hasActiveSession && !insideRadius) {
      const departureTime = timestamp ? new Date(timestamp) : new Date();
      handleCheckOut('Auto-Checked Out', departureTime);
    }
  }, [handleCheckOut]);

  const evaluateLocationRef = useRef(evaluateLocation);
  useEffect(() => {
    evaluateLocationRef.current = evaluateLocation;
  }, [evaluateLocation]);

  // Restore active session on mount
  useEffect(() => {
    const storedSession = localStorage.getItem(STORAGE_KEY);
    if (storedSession) {
      try {
        const { startTime } = JSON.parse(storedSession);
        const start = new Date(startTime);
        setActiveSessionStart(start);
        activeSessionStartRef.current = start;
        setIsCheckedIn(true);
        isCheckedInRef.current = true;
        
        const initialElapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
        setElapsedSeconds(initialElapsed);
      } catch (err) {
        console.error('Failed to parse active session', err);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const checkCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => evaluateLocationRef.current(pos),
      (_err) => {
        setIsInRange(false);
        setGeoError('Location permission required.');
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, []);

  // GPS Watcher
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => evaluateLocationRef.current(pos),
      (_error) => {
        setIsInRange(false);
        setGeoError('Location permission required to verify restaurant proximity.');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Re-verify position on tab focus or wake
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const currentStart = activeSessionStartRef.current;
        if (currentStart) {
          const now = Date.now();
          const seconds = Math.floor((now - currentStart.getTime()) / 1000);
          setElapsedSeconds(seconds);
        }
        checkCurrentLocation();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [checkCurrentLocation]);

  // Timer Tick
  useEffect(() => {
    if (isCheckedIn && activeSessionStart) {
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const seconds = Math.floor((now - activeSessionStart.getTime()) / 1000);
        setElapsedSeconds(seconds);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCheckedIn, activeSessionStart]);

  const handleCheckIn = () => {
    if (!isInRange) return;

    const now = new Date();
    setIsCheckedIn(true);
    isCheckedInRef.current = true;
    setActiveSessionStart(now);
    activeSessionStartRef.current = now;
    setElapsedSeconds(0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ startTime: now.toISOString() }));
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" /> Staff Attendance Tracker
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Logged in as: <strong className="text-indigo-300">{currentUser}</strong> | Radius boundary: {ALLOWED_RADIUS_METERS}m.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <MapPin className={`w-4 h-4 ${isInRange ? 'text-emerald-400' : 'text-rose-400'}`} />
            {geoError ? (
              <span className="text-amber-400">{geoError}</span>
            ) : userDistance !== null ? (
              <span>
                Distance: <strong className="text-white">{userDistance}m</strong>{' '}
                {isInRange ? (
                  <span className="text-emerald-400 font-medium">(In Range)</span>
                ) : (
                  <span className="text-rose-400 font-medium">(Out of Range)</span>
                )}
              </span>
            ) : (
              <span className="text-slate-400">Detecting location...</span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 bg-slate-950 p-4 rounded-xl border border-slate-800">
          <div>
            <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Active Shift Timer</span>
            <div className="text-3xl font-mono font-bold text-white mt-1">
              {formatTime(elapsedSeconds)}
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {!isCheckedIn ? (
              <button
                onClick={handleCheckIn}
                disabled={!isInRange}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  isInRange
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-lg shadow-emerald-900/20'
                    : 'bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" /> Check In
              </button>
            ) : (
              <button
                onClick={() => handleCheckOut('Completed')}
                disabled={!isInRange}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  isInRange
                    ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer shadow-lg shadow-rose-900/20'
                    : 'bg-slate-800/80 text-slate-500 border border-slate-700/50 cursor-not-allowed opacity-60'
                }`}
              >
                <XCircle className="w-4 h-4" /> Check Out
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-indigo-400" />
          <h3 className="text-md font-semibold text-white">Attendance History</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-950 text-slate-300 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 rounded-l-xl">Employee</th>
                <th className="px-4 py-3">Check In</th>
                <th className="px-4 py-3">Check Out</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3 rounded-r-xl">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {attendanceHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500 italic">
                    No attendance logs recorded yet today.
                  </td>
                </tr>
              ) : (
                attendanceHistory.map((record, index) => (
                  <tr key={record._id || record.id || `record-${index}`} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-white font-medium">{record.employeeName}</td>
                    <td className="px-4 py-3">{record.checkInTime}</td>
                    <td className="px-4 py-3">{record.checkOutTime || '--'}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{record.duration}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          record.status === 'Completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : record.status === 'Auto-Checked Out'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}
                      >
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};