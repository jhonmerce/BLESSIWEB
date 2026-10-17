export function safePdfFilenamePart(value: unknown): string {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'inconnu';
}

export function localDateTimeFilename(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'date-inconnue';

  const pad = (part: number) => String(part).padStart(2, '0');
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const timePart = `${pad(date.getHours())}h${pad(date.getMinutes())}m${pad(date.getSeconds())}s`;

  return `${datePart}_${timePart}`;
}
