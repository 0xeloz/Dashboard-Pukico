import { formatEther, parseEther } from 'viem';

/**
 * Formatting helpers for localized date, time, and currency amounts
 */

/**
 * Format ETH balance:
 * - Tampilkan sampai 8 desimal tanpa nol di belakang
 * - "< 0.00000001" jika sangat kecil
 * - "0" jika nol
 */
export function formatEthBalance(
  val: bigint | string | number | null | undefined
): string {
  if (val === null || val === undefined || val === '') return '0';

  let weiBig: bigint;
  if (typeof val === 'bigint') {
    weiBig = val;
  } else if (typeof val === 'string') {
    const clean = val.replace(/,/g, '').trim();
    if (!clean || clean === '0') return '0';
    if (clean.startsWith('<')) return clean;
    if (clean.includes('.')) {
      try {
        weiBig = parseEther(clean);
      } catch {
        return clean;
      }
    } else {
      try {
        weiBig = BigInt(clean);
      } catch {
        return clean;
      }
    }
  } else if (typeof val === 'number') {
    if (isNaN(val) || val === 0) return '0';
    try {
      weiBig = parseEther(val.toFixed(18));
    } catch {
      return String(val);
    }
  } else {
    return '0';
  }

  if (weiBig === 0n) return '0';

  // 0.00000001 ETH = 10^10 wei (10_000_000_000n)
  if (weiBig < 10000000000n) {
    return '< 0.00000001';
  }

  const ethStr = formatEther(weiBig);
  const parts = ethStr.split('.');
  if (parts.length === 1) return parts[0];

  let dec = parts[1].slice(0, 8);
  dec = dec.replace(/0+$/, '');
  return dec ? `${parts[0]}.${dec}` : parts[0];
}

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
 * Format ETH network fee:
 * - If 0 wei -> "0"
 * - If < 0.000001 ETH -> "< 0.000001"
 * - Otherwise -> max 8 decimals without trailing zeros
 */
export function formatEthFee(wei: bigint | string | number): string {
  let weiBig: bigint;
  try {
    weiBig = typeof wei === 'bigint' ? wei : BigInt(wei);
  } catch {
    return '0';
  }

  if (weiBig === 0n) return '0';

  // 0.000001 ETH = 10^12 wei (1_000_000_000_000n)
  if (weiBig < 1000000000000n) {
    return '< 0.000001';
  }

  const ethStr = formatEther(weiBig);
  const parts = ethStr.split('.');
  if (parts.length === 1) return parts[0];

  let dec = parts[1].slice(0, 8);
  dec = dec.replace(/0+$/, '');
  return dec ? `${parts[0]}.${dec}` : parts[0];
}

/**
 * Format asset amount:
 * - USDC: always exactly 2 decimals (e.g. 10.00)
 * - ETH: max 8 decimals without trailing zeros (e.g. 0.05, 1, 0.00012345)
 */
export function formatAssetAmount(
  amount: string | number | undefined | null,
  asset: 'USDC' | 'ETH' | string = 'USDC'
): string {
  if (amount === undefined || amount === null || amount === '') {
    return asset === 'USDC' ? '0.00' : '0';
  }
  const cleanStr = String(amount).replace(/,/g, '').trim();
  const num = parseFloat(cleanStr);
  if (isNaN(num)) return String(amount);

  if (asset === 'USDC') {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // ETH: max 8 decimals without trailing zeros
  const parts = cleanStr.split('.');
  if (parts.length === 1) {
    const whole = parseInt(parts[0], 10);
    return isNaN(whole) ? parts[0] : whole.toLocaleString('en-US');
  }
  const whole = parseInt(parts[0], 10);
  const wholeStr = isNaN(whole) ? parts[0] : whole.toLocaleString('en-US');
  let dec = parts[1].slice(0, 8);
  dec = dec.replace(/0+$/, '');
  return dec ? `${wholeStr}.${dec}` : wholeStr;
}

/**
 * Legacy wrapper forwarding to formatAssetAmount
 */
export function formatAmountNumber(
  amount: string | number | undefined | null,
  assetOrLang?: 'USDC' | 'ETH' | string,
  _lang: 'en' | 'id' = 'en'
): string {
  const asset = assetOrLang === 'ETH' || assetOrLang === 'USDC' ? assetOrLang : 'USDC';
  return formatAssetAmount(amount, asset);
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

/**
 * Format month and year, e.g. "January 2025" or "Januari 2025"
 */
export function formatJoinedDate(
  dateString: string | undefined | null,
  lang: 'en' | 'id' = 'en'
): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}
