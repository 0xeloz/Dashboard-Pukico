/**
 * Formatting helpers for localized date, time, and currency amounts
 */

/**
 * Format relative time using Intl.RelativeTimeFormat
 * Outputs e.g. "5 minutes ago" / "5 menit yang lalu", "2 hours ago" / "2 jam yang lalu",
 * "yesterday" / "kemarin"
 */
export function formatRelativeTime(
  dateStringOrTimestamp: string | number | undefined | null,
  lang: 'en' | 'id' = 'en'
): string {
  if (!dateStringOrTimestamp) return '';
  const date =
    typeof dateStringOrTimestamp === 'number'
      ? new Date(dateStringOrTimestamp)
      : new Date(dateStringOrTimestamp);
  if (isNaN(date.getTime())) return '';

  const now = Date.now();
  const diffSec = Math.round((date.getTime() - now) / 1000);
  const absSec = Math.abs(diffSec);

  const rtf = new Intl.RelativeTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    numeric: 'auto',
  });

  if (absSec < 45) {
    return lang === 'id' ? 'baru saja' : 'just now';
  }
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) {
    return rtf.format(diffMin, 'minute');
  }
  const diffHour = Math.round(diffSec / 3600);
  if (Math.abs(diffHour) < 24) {
    return rtf.format(diffHour, 'hour');
  }
  const diffDay = Math.round(diffSec / 86400);
  if (Math.abs(diffDay) < 30) {
    return rtf.format(diffDay, 'day');
  }
  const diffMonth = Math.round(diffSec / (86400 * 30));
  if (Math.abs(diffMonth) < 12) {
    return rtf.format(diffMonth, 'month');
  }
  const diffYear = Math.round(diffSec / (86400 * 365));
  return rtf.format(diffYear, 'year');
}

/**
 * Format transaction amount according to locale without recalculating float math
 */
export function formatAmountNumber(
  amount: string | number | undefined | null,
  lang: 'en' | 'id' = 'en'
): string {
  if (amount === undefined || amount === null || amount === '') return '0.00';
  const cleanStr = String(amount).replace(/,/g, '').trim();
  const num = parseFloat(cleanStr);
  if (isNaN(num)) return cleanStr;

  const formatter = new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  return formatter.format(num);
}

/**
 * Format full date and time for transaction details
 */
export function formatFullDateTime(
  dateString: string | undefined | null,
  lang: 'en' | 'id' = 'en'
): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
