import { useAuth } from '../auth/AuthContext';

// Currency is set per-location (a chain can bill different branches in
// different currencies) — currentRestaurant.currency is only a fallback for
// the brief window before a location is resolved, and 'Rs.' is the ultimate
// default, mirroring both models' own field defaults.
export function useCurrency(): string {
  const { currentLocation, currentRestaurant } = useAuth();
  return currentLocation?.currency || currentRestaurant?.currency || 'Rs.';
}
