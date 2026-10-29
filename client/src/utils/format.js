const moneyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'EGP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const formatMoney = (value) => moneyFormatter.format(Number(value) || 0);

export const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export const formatDate = (value) => {
  if (!value) return '—';
  // For YYYY-MM-DD strings, parse as UTC to avoid timezone-shift bugs
  const parts = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
    const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  // Fallback for non-date-only strings
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
};
