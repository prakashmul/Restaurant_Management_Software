// Minimal CSV builder — no external dependency needed for the shape of
// exports this app produces (flat rows, no nested/streaming data).
function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// columns: [{ key, label }]; rows: array of plain objects
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
}
