// Converts a plain YYYY-MM-DD (from a <input type="date">, in the user's
// local calendar) into the correct UTC instant for the start/end of that
// local day. The backend's date-range filters (Dashboard summary, Expenses)
// accept either a bare date (UTC-anchored) or a full ISO instant — sending
// the instant here means "today" always means the browser's actual today,
// not whatever day UTC happens to be at the moment (which can lag behind a
// timezone ahead of UTC by several hours).
export function toLocalRangeStartISO(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

export function toLocalRangeEndISO(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}
