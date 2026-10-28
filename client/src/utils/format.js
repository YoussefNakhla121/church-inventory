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
