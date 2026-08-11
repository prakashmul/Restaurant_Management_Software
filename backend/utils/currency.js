import Restaurant from '../models/Restaurant.js';
import Location from '../models/Location.js';

// Currency is set per-location (a chain can bill different branches in
// different currencies) with the restaurant's own currency as a fallback for
// requests with no resolved location, and 'Rs.' as the ultimate default —
// mirrors both models' own field defaults.
export async function getCurrencySymbol(restaurantId, locationId) {
  if (locationId) {
    const location = await Location.findById(locationId).select('currency');
    if (location?.currency) return location.currency;
  }
  const restaurant = await Restaurant.findById(restaurantId).select('currency');
  return restaurant?.currency || 'Rs.';
}
