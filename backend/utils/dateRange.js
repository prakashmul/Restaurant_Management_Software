// A caller can pass either a bare YYYY-MM-DD date (day-boundary semantics
// anchored to UTC, the existing convention across this codebase) or a full
// ISO instant — e.g. a client-computed local-midnight boundary already
// converted to its correct UTC instant. This lets a timezone-aware caller
// (a restaurant whose local day doesn't line up with UTC's) send an exact
// instant while a plain date string keeps behaving exactly as before.
export function rangeStart(dateStr) {
  return dateStr.includes('T') ? new Date(dateStr) : new Date(`${dateStr}T00:00:00Z`);
}

export function rangeEnd(dateStr) {
  return dateStr.includes('T') ? new Date(dateStr) : new Date(`${dateStr}T23:59:59.999Z`);
}
