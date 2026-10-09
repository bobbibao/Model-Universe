// Short VND amounts for chart axes and labels (e.g. 1,5 tr, 2,1 tỷ).
export const formatCompactVND = (amount: number, locale = 'vi'): string => {
  const format = (value: number, unit: string) =>
    `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} ${unit}`;
  const absolute = Math.abs(amount);
  if (absolute >= 1e9) return format(amount / 1e9, locale === 'vi' ? 'tỷ' : 'bn');
  if (absolute >= 1e6) return format(amount / 1e6, locale === 'vi' ? 'tr' : 'm');
  if (absolute >= 1e3) return format(amount / 1e3, 'k');
  return `${Math.round(amount)}`;
};

// 'YYYY-MM' -> 'T9/2026'
export const formatMonthLabel = (month: string, locale = 'vi'): string => {
  const [year, monthNumber] = month.split('-');
  return locale === 'vi' ? `T${Number(monthNumber)}/${year}` : new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1)));
};

// Share of `part` in `total` as a whole percentage (0 when total is 0).
export const toPercent = (part: number, total: number): number => (total > 0 ? Math.round((part / total) * 100) : 0);
