import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapPin, Clock, History, CheckCircle2, XCircle, Coffee,
  Play, Printer, Calendar, DollarSign, TrendingUp, ShoppingBag, CreditCard,
  PiggyBank, Wallet, AlertTriangle
} from 'lucide-react';
import { posApi } from '../../api/posApi';
import type { DashboardSummary } from '../../api/posApi';
import { useAuth } from '../../auth/AuthContext';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { LowStockWidget } from './LowStockWidget';
import { SalesTrendChart } from './SalesTrendChart';
import { toLocalRangeStartISO, toLocalRangeEndISO } from '../../lib/dateRange';

function formatLocalYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  date?: string;
  checkInTime: string;
  checkOutTime: string | null;
  duration: string;
  status: 'Completed' | 'Auto-Checked Out' | 'Active';
}

interface OrderRecord {
  _id: string;
  total: number;
  status: 'pending' | 'paid' | 'credit' | 'unsettled' | 'settled' | 'cancelled';
  remainingBalance?: number;
  createdAt?: string;
}

export const DashboardPage: React.FC = () => {
  const { currentUser: authUser, currentRestaurant, currentLocation, isOwner } = useAuth();
  const currentUser = authUser?.name || 'Current Employee';
  const currency = currentLocation?.currency || currentRestaurant?.currency || 'Rs.';

  // A location only gets a geofence once its Owner configures one — every
  // new location starts with latitude/longitude unset. Until then,
  // attendance check-in/out is not location-restricted.
  const geofenceLatitude = currentLocation?.geofence?.latitude ?? null;
  const geofenceLongitude = currentLocation?.geofence?.longitude ?? null;
  const isGeofenceConfigured = geofenceLatitude !== null && geofenceLongitude !== null;
  const allowedRadiusMeters = currentLocation?.geofence?.radiusMeters ?? 300;

  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [userDistance, setUserDistance] = useState<number | null>(null);
  const [isInRange, setIsInRange] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [activeSessionStart, setActiveSessionStart] = useState<Date | null>(null);
  const activeSessionStartRef = useRef<Date | null>(null);
  const isCheckedInRef = useRef<boolean>(false);
  const isOnBreakRef = useRef<boolean>(false);

  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0);
  const accumulatedSecondsRef = useRef(0);
  const breakStartRef = useRef<Date | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [selectedRecordForPrint, setSelectedRecordForPrint] = useState<AttendanceRecord | null>(null);
  const [isBulkPrint, setIsBulkPrint] = useState(false);

  // Filter States
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  // Dashboard Stats State — orders (unfiltered, last 14 days worth is all
  // SalesTrendChart needs) stay separate from the Restaurant Overview's own
  // date-ranged summary below, which is computed server-side so it can net
  // out refunds/discounts correctly and cost dishes per-location.
  const [orders, setOrders] = useState<OrderRecord[]>([]);

  const fetchDashboardData = async () => {
    try {
      if (posApi.fetchOrders) {
        const orderData = await posApi.fetchOrders();
        if (Array.isArray(orderData)) {
          setOrders(orderData);
        }
      }
    } catch (err) {
      console.error('Failed to fetch dashboard order data', err);
    }
  };

  useEffect(() => {
    if (isOwner) {
      fetchDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, currentLocation?.id]);

  useRealtimeRefresh(['order'], () => {
    if (isOwner) fetchDashboardData();
  });

  // Restaurant Overview date range — defaults to today, independent of the
  // Attendance History filter further down the page.
  const [overviewStartDate, setOverviewStartDate] = useState(formatLocalYYYYMMDD(new Date()));
  const [overviewEndDate, setOverviewEndDate] = useState(formatLocalYYYYMMDD(new Date()));
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const fetchSummary = async () => {
    try {
      const data = await posApi.getDashboardSummary({
        startDate: toLocalRangeStartISO(overviewStartDate),
        endDate: toLocalRangeEndISO(overviewEndDate),
      });
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch dashboard summary', err);
    }
  };

  useEffect(() => {
    if (isOwner) fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, currentLocation?.id, overviewStartDate, overviewEndDate]);

  useRealtimeRefresh(['order', 'expense'], () => {
    if (isOwner) fetchSummary();
  });

  const setOverviewToToday = () => {
    const today = formatLocalYYYYMMDD(new Date());
    setOverviewStartDate(today);
    setOverviewEndDate(today);
  };

  useEffect(() => {
    activeSessionStartRef.current = activeSessionStart;
  }, [activeSessionStart]);

  useEffect(() => {
    isCheckedInRef.current = isCheckedIn;
  }, [isCheckedIn]);

  useEffect(() => {
    isOnBreakRef.current = isOnBreak;
  }, [isOnBreak]);

  useEffect(() => {
    accumulatedSecondsRef.current = accumulatedSeconds;
  }, [accumulatedSeconds]);

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const parseDurationToSeconds = (durationStr: string) => {
    if (!durationStr) return 0;
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  const loadHistory = async () => {
    try {
      const data = await posApi.fetchAttendanceHistory();
      if (Array.isArray(data)) {
        const processedData = data
          .map((item: any) => ({
            ...item,
            date: item.date || item.checkInDate || (item.createdAt ? item.createdAt.split('T')[0] : new Date().toISOString().split('T')[0])
          }))
          // OWNER sees ALL records; STAFF sees ONLY their OWN records
          .filter((item: any) => isOwner || item.employeeName === currentUser);

        setAttendanceHistory(processedData);
      }
    } catch (err) {
      console.error('Failed to load attendance history', err);
    }
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, currentUser, currentLocation?.id]);

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

    setIsCheckedIn(false);
    setIsOnBreak(false);
    isCheckedInRef.current = false;
    isOnBreakRef.current = false;
    localStorage.removeItem(STORAGE_KEY);

    const now = customCheckoutTime || new Date();

    if (sessionStart) {
      const effectiveCheckout = now < sessionStart ? sessionStart : now;
      const totalDurationSecs = accumulatedSecondsRef.current;
      const currentDateStr = new Date().toISOString().split('T')[0];

      const payload: AttendanceRecord = {
        employeeName: currentUser,
        date: currentDateStr,
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
    setAccumulatedSeconds(0);
    accumulatedSecondsRef.current = 0;
    setElapsedSeconds(0);
    breakStartRef.current = null;
  }, [activeSessionStart, currentUser]);

  const evaluateLocation = useCallback((position: GeolocationPosition) => {
    if (!isGeofenceConfigured || geofenceLatitude === null || geofenceLongitude === null) {
      setGeoError(null);
      setUserDistance(null);
      setIsInRange(true);
      return;
    }

    setGeoError(null);
    const { latitude, longitude } = position.coords;
    const timestamp = position.timestamp;

    const distance = calculateDistanceInMeters(latitude, longitude, geofenceLatitude, geofenceLongitude);

    const distRounded = Math.round(distance);
    setUserDistance(distRounded);
    const insideRadius = distance <= allowedRadiusMeters;
    setIsInRange(insideRadius);

    const hasActiveSession = isCheckedInRef.current || !!localStorage.getItem(STORAGE_KEY);

    if (hasActiveSession && !insideRadius) {
      const departureTime = timestamp ? new Date(timestamp) : new Date();
      handleCheckOut('Auto-Checked Out', departureTime);
    }
  }, [handleCheckOut, isGeofenceConfigured, geofenceLatitude, geofenceLongitude, allowedRadiusMeters]);

  const evaluateLocationRef = useRef(evaluateLocation);
  useEffect(() => {
    evaluateLocationRef.current = evaluateLocation;
  }, [evaluateLocation]);

  useEffect(() => {
    const storedSession = localStorage.getItem(STORAGE_KEY);
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);
        const start = new Date(parsed.startTime);
        setActiveSessionStart(start);
        activeSessionStartRef.current = start;
        setIsCheckedIn(true);
        isCheckedInRef.current = true;
        
        if (parsed.onBreak) {
          setIsOnBreak(true);
          isOnBreakRef.current = true;
          breakStartRef.current = parsed.breakStartTime ? new Date(parsed.breakStartTime) : new Date();
        }

        const restoredAccumulated = parsed.accumulatedSeconds || 0;
        setAccumulatedSeconds(restoredAccumulated);
        accumulatedSecondsRef.current = restoredAccumulated;
        setElapsedSeconds(restoredAccumulated);
      } catch (err) {
        console.error('Failed to parse active session', err);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const checkCurrentLocation = useCallback(() => {
    if (!isGeofenceConfigured) {
      setIsInRange(true);
      setGeoError(null);
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => evaluateLocationRef.current(pos),
      (_err) => {
        setIsInRange(false);
        setGeoError('Location permission required.');
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  }, [isGeofenceConfigured]);

  useEffect(() => {
    if (!isGeofenceConfigured) {
      setIsInRange(true);
      setGeoError(null);
      return;
    }

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
  }, [isGeofenceConfigured]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
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

  useEffect(() => {
    if (isCheckedIn && !isOnBreak && activeSessionStart) {
      timerRef.current = setInterval(() => {
        setAccumulatedSeconds((prev) => {
          const nextVal = prev + 1;
          setElapsedSeconds(nextVal);
          return nextVal;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCheckedIn, isOnBreak, activeSessionStart]);

  const updateLocalStorageState = (extraData = {}) => {
    if (!activeSessionStart) return;
    const sessionData = {
      startTime: activeSessionStart.toISOString(),
      onBreak: isOnBreakRef.current,
      breakStartTime: breakStartRef.current?.toISOString() || null,
      accumulatedSeconds: accumulatedSecondsRef.current,
      ...extraData,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
  };

  const handleCheckIn = () => {
    if (!isInRange) return;

    const now = new Date();
    setIsCheckedIn(true);
    isCheckedInRef.current = true;
    setIsOnBreak(false);
    isOnBreakRef.current = false;
    setActiveSessionStart(now);
    activeSessionStartRef.current = now;
    setAccumulatedSeconds(0);
    accumulatedSecondsRef.current = 0;
    setElapsedSeconds(0);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
      startTime: now.toISOString(), 
      onBreak: false, 
      accumulatedSeconds: 0 
    }));
  };

  const handleStartBreak = () => {
    if (!isCheckedIn || isOnBreak) return;
    setIsOnBreak(true);
    isOnBreakRef.current = true;
    breakStartRef.current = new Date();
    updateLocalStorageState({ onBreak: true, breakStartTime: breakStartRef.current.toISOString() });
  };

  const handleEndBreak = () => {
    if (!isCheckedIn || !isOnBreak) return;
    setIsOnBreak(false);
    isOnBreakRef.current = false;
    breakStartRef.current = null;
    updateLocalStorageState({ onBreak: false, breakStartTime: null });
  };

  const triggerPrintReceipt = (record: AttendanceRecord) => {
    setIsBulkPrint(false);
    setSelectedRecordForPrint(record);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const filteredHistory = useMemo(() => {
    return attendanceHistory.filter((record) => {
      if (!startDateFilter && !endDateFilter) return true;
      if (!record.date) return false;
      if (startDateFilter && record.date < startDateFilter) return false;
      if (endDateFilter && record.date > endDateFilter) return false;
      return true;
    });
  }, [attendanceHistory, startDateFilter, endDateFilter]);

  const totalFilteredSeconds = useMemo(() => {
    return filteredHistory.reduce((acc, curr) => acc + parseDurationToSeconds(curr.duration), 0);
  }, [filteredHistory]);

  const triggerBulkPrint = () => {
    setIsBulkPrint(true);
    setSelectedRecordForPrint({} as AttendanceRecord);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="p-6 space-y-6 bg-slate-950 text-slate-100 min-h-screen">
      <LowStockWidget />

      {/* Printable Receipt Section */}
      {selectedRecordForPrint && (
        <div id="printable-receipt" className="hidden print:block font-mono text-black p-4 bg-white w-[320px] mx-auto text-xs leading-tight">
          <div className="text-center space-y-0.5 mb-3 border-b border-black pb-2">
            <img
              src={currentRestaurant?.logoUrl || '/assets/Logo.jpeg'}
              className='receipt-logo'
              alt="Logo"
            />
            <h1 className="font-bold text-sm tracking-wide">{currentRestaurant?.name || 'Restaurant'}</h1>
            {currentLocation?.address && <p>{currentLocation.address}</p>}
            {currentLocation?.phone && <p>Ph: {currentLocation.phone}</p>}
          </div>

          {!isBulkPrint ? (
            <div className="space-y-1 mb-3 border-b border-black pb-2 text-[11px]">
              <div className="flex justify-between">
                <span>Staff Name:</span>
                <span className="font-bold">{selectedRecordForPrint.employeeName}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{selectedRecordForPrint.date || 'Today'}</span>
              </div>
              <div className="flex justify-between">
                <span>Check In:</span>
                <span>{selectedRecordForPrint.checkInTime}</span>
              </div>
              <div className="flex justify-between">
                <span>Check Out:</span>
                <span>{selectedRecordForPrint.checkOutTime || '--'}</span>
              </div>
              <div className="flex justify-between">
                <span>Hours Worked:</span>
                <span className="font-bold">{selectedRecordForPrint.duration}</span>
              </div>
              <div className="flex justify-between">
                <span>Status:</span>
                <span>{selectedRecordForPrint.status}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2 mb-3 border-b border-black pb-2 text-[10px]">
              <div className="text-center font-bold underline mb-1">ATTENDANCE REPORT SUMMARY</div>
              <div className="flex justify-between mb-2">
                <span>Range:</span>
                <span>{startDateFilter || 'Start'} to {endDateFilter || 'Now'}</span>
              </div>
              {filteredHistory.map((rec, idx) => (
                <div key={idx} className="border-b border-dashed border-gray-400 pb-1 mb-1">
                  <div className="font-bold">{rec.employeeName} ({rec.date || 'N/A'})</div>
                  <div className="flex justify-between">
                    <span>In/Out:</span>
                    <span>{rec.checkInTime} - {rec.checkOutTime || '--'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span>{rec.duration}</span>
                  </div>
                </div>
              ))}
              <div className="pt-2 pb-1 font-bold flex justify-between text-xs">
                <span>Total Hours Worked:</span>
                <span>{formatTime(totalFilteredSeconds)}</span>
              </div>
            </div>
          )}

          <div className="text-center space-y-1 pt-1 text-[10px]">
            <p className="font-bold">*** OFFICIAL SHIFT RECORD ***</p>
            <p>Verified via Software System</p>
            <p className="mt-2 text-[9px]">Thank you for your hard work!</p>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* RESTAURANT OVERVIEW - OWNER ONLY                           */}
      {/* ========================================================= */}
      {isOwner && (
        <div className="print:hidden space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-indigo-400" /> Restaurant Overview
              </h1>
              <p className="text-xs text-slate-400">Performance summary for the selected date range</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
              <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
              <input
                type="date"
                value={overviewStartDate}
                onChange={(e) => setOverviewStartDate(e.target.value)}
                className="bg-transparent text-white outline-none cursor-pointer"
              />
              <span className="text-slate-500">to</span>
              <input
                type="date"
                value={overviewEndDate}
                onChange={(e) => setOverviewEndDate(e.target.value)}
                className="bg-transparent text-white outline-none cursor-pointer"
              />
              <button
                onClick={setOverviewToToday}
                className="ml-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition"
              >
                Today
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1: Gross Sales */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400">Gross Sales</p>
                <h3 className="text-2xl font-bold text-white mt-1">
                  {currency} {(summary?.grossSales || 0).toLocaleString()}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Cash + credit payments received</p>
              </div>
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>

            {/* Card 2: Net Revenue */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400">Paid Revenue</p>
                <h3 className="text-2xl font-bold text-emerald-400 mt-1">
                  {currency} {(summary?.netPaidSales || 0).toLocaleString()}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Direct cash/card sales only</p>
              </div>
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>

            {/* Card 3: Total Orders */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400">Total Orders</p>
                <h3 className="text-2xl font-bold text-white mt-1">
                  {summary?.totalOrdersCount || 0}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Completed & active orders</p>
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
                <ShoppingBag className="w-6 h-6" />
              </div>
            </div>

            {/* Card 4: Credit Balance */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400">Pending Credit Owed</p>
                <h3 className="text-2xl font-bold text-amber-400 mt-1">
                  {currency} {(summary?.creditOwed || 0).toLocaleString()}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Customer ledger balance</p>
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl">
                <CreditCard className="w-6 h-6" />
              </div>
            </div>

            {/* Card 5: Gross Profit */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400 flex items-center gap-1">
                  Gross Profit
                  {summary?.dishesMissingCostData && (
                    <span title="Some sold dishes have no recipe cost set, so this may be understated.">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                    </span>
                  )}
                </p>
                <h3 className="text-2xl font-bold text-teal-400 mt-1">
                  {currency} {(summary?.grossProfit || 0).toLocaleString()}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Revenue minus ingredient cost</p>
              </div>
              <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-xl">
                <PiggyBank className="w-6 h-6" />
              </div>
            </div>

            {/* Card 6: Net Profit */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-400">Net Profit</p>
                <h3 className={`text-2xl font-bold mt-1 ${(summary?.netProfit || 0) >= 0 ? 'text-violet-400' : 'text-rose-400'}`}>
                  {currency} {(summary?.netProfit || 0).toLocaleString()}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Gross profit minus {currency} {(summary?.totalExpenses || 0).toLocaleString()} expenses
                </p>
              </div>
              <div className="p-3 bg-violet-500/10 border border-violet-500/20 text-violet-400 rounded-xl">
                <Wallet className="w-6 h-6" />
              </div>
            </div>
          </div>

          <SalesTrendChart orders={orders} />
        </div>
      )}

      {/* ========================================================= */}
      {/* STAFF ATTENDANCE TRACKER COMPONENT                         */}
      {/* ========================================================= */}
      <div className="print:hidden bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" /> Staff Attendance Tracker
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Logged in as: <strong className="text-indigo-300">{currentUser}</strong>
              {isGeofenceConfigured && ` | Radius boundary: ${allowedRadiusMeters}m.`}
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <MapPin className={`w-4 h-4 ${isInRange ? 'text-emerald-400' : 'text-rose-400'}`} />
            {!isGeofenceConfigured ? (
              <span className="text-slate-400">No location restriction set</span>
            ) : geoError ? (
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
            <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
              {isOnBreak ? 'Shift Paused (On Break)' : 'Active Shift Timer'}
            </span>
            <div className="text-3xl font-mono font-bold text-white mt-1 flex items-center gap-3">
              <span>{formatTime(elapsedSeconds)}</span>
              {isOnBreak && (
                <span className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg animate-pulse font-sans">
                  On Break
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
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
              <>
                {!isOnBreak ? (
                  <button
                    onClick={handleStartBreak}
                    className="px-4 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white cursor-pointer shadow-lg shadow-amber-900/20"
                  >
                    <Coffee className="w-4 h-4" /> Break In
                  </button>
                ) : (
                  <button
                    onClick={handleEndBreak}
                    className="px-4 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-lg shadow-indigo-900/20"
                  >
                    <Play className="w-4 h-4" /> Break Out
                  </button>
                )}

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
              </>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ATTENDANCE HISTORY LOG                                    */}
      {/* ========================================================= */}
      <div className="print:hidden bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <h3 className="text-md font-semibold text-white">
              {isOwner ? 'All Employees Attendance History' : 'My Attendance History'}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-300">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span className="text-slate-400">Filter:</span>
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="bg-transparent text-white outline-none cursor-pointer"
              />
              <span className="text-slate-500">to</span>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="bg-transparent text-white outline-none cursor-pointer"
              />
            </div>

            <span className="text-xs text-slate-400">{filteredHistory.length} entries</span>

            <button
              onClick={triggerBulkPrint}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-all shadow-lg shadow-indigo-900/20 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl text-xs">
          <span className="text-slate-400 font-medium">Total Worked Hours in Selected Range:</span>
          <span className="font-mono font-bold text-emerald-400 text-sm">{formatTime(totalFilteredSeconds)}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-950 text-slate-300 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 rounded-l-xl">Employee</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Check In</th>
                <th className="px-4 py-3">Check Out</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 rounded-r-xl text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500 italic">
                    No attendance logs found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((record, index) => (
                  <tr key={record._id || record.id || `record-${index}`} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-white font-medium">{record.employeeName}</td>
                    <td className="px-4 py-3 text-slate-300">{record.date || '--'}</td>
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
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => triggerPrintReceipt(record)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-all"
                        title="Print Receipt"
                      >
                        <Printer className="w-3.5 h-3.5 text-indigo-400" /> Print
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-receipt, #printable-receipt * {
            visibility: visible !important;
          }
          #printable-receipt {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10px !important;
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
};