// RFC 4180 quoting plus protection against spreadsheet formula injection.
// Labels/dates are localized by callers; financial numbers remain canonical
// decimal numbers for import/reconciliation, regardless of display locale.
export function csvCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function serializeCsv(rows) {
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(rows, filename) {
  const file = new Blob([serializeCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
