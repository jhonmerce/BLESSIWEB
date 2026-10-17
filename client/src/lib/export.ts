import type { AnyRow } from '../types';

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    value = row.nom ?? JSON.stringify(value);
  }

  const text = String(value);
  // Empêche Excel/LibreOffice d’interpréter une donnée exportée comme formule.
  const safeText = /^[\t\r ]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function exportRows(rows: AnyRow[], name: string) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const records = rows.map((row) => headers.map((header) => cellText(row[header])).join(';'));
  const content = `\uFEFF${[headers.map(cellText).join(';'), ...records].join('\r\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
