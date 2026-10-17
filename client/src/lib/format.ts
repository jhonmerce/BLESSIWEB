export const money = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
export const nfmt = (value: number) => new Intl.NumberFormat('fr-FR').format(value || 0);
export const day = (value: string) =>
  value
    ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(
        new Date(value),
      )
    : '—';
export const dt = (value: string) =>
  value
    ? new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '—';
