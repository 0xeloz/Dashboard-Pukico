import { formatEther, parseEther, formatUnits, parseUnits } from 'viem';

/**
 * Format raw USDC units (bigint, 6 decimals):
 * - Exactly 2 decimals with truncation (floor without rounding up)
 * - cents = raw / 10000n (for negative, truncates towards zero)
 * - Formatted as "int.dd" with canonical thousands commas
 * - No Number/parseFloat/toLocaleString
 * Examples:
 *   9975000n -> "9.97"
 *   5020000n -> "5.02"
 *   20000n -> "0.02"
 *   10000n -> "0.01"
 *   5000n -> "0.00"
 *   1234500000n -> "1,234.50"
 */
export function formatUsdcUnits(raw: bigint): string {
  const isNegative = raw < 0n;
  const absRaw = isNegative ? -raw : raw;
  const absCents = absRaw / 10000n;

  const intPart = absCents / 100n;
  const fracPart = absCents % 100n;

  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fracStr = fracPart.toString().padStart(2, '0');

  const result = `${intStr}.${fracStr}`;
  return isNegative && absCents > 0n ? `-${result}` : result;
}

/**
 * Format string USDC amount (e.g. from server / tx.amount / BalanceContext):
 * Exact 2 decimals with truncation (floor without rounding up).
 * Parses into raw BigInt 6-decimals without Number/parseFloat/toLocaleString,
 * then delegates to formatUsdcUnits.
 */
export function formatUsdcString(amount: string | number | undefined | null): string {
  if (amount === undefined || amount === null) return '0.00';
  const str = String(amount).replace(/,/g, '').trim();
  if (!str) return '0.00';

  try {
    let sanitized = str;
    const isNegative = sanitized.startsWith('-');
    if (isNegative) sanitized = sanitized.slice(1);

    const dotIdx = sanitized.indexOf('.');
    let intStr = sanitized;
    let decStr = '';
    if (dotIdx !== -1) {
      intStr = sanitized.slice(0, dotIdx);
      decStr = sanitized.slice(dotIdx + 1, dotIdx + 7);
    }
    decStr = decStr.padEnd(6, '0');
    const raw = (BigInt(intStr || '0') * 1000000n + BigInt(decStr)) * (isNegative ? -1n : 1n);
    return formatUsdcUnits(raw);
  } catch {
    return '0.00';
  }
}

/**
 * Localize number string based on language:
 * - 'en': returns canonical string untouched (dot decimal, comma thousands)
 * - 'id': swaps dots and commas in a single pass (comma decimal, dot thousands)
 * Any non-numeric prefix like "< " is preserved untouched.
 * Examples:
 *   "9.975" -> "9,975"
 *   "1,234.50" -> "1.234,50"
 *   "< 0.00000001" -> "< 0,00000001"
 *   "0.0009967" -> "0,0009967"
 */
export function localizeNumber(text: string, lang: 'en' | 'id'): string {
  if (lang === 'en' || !text) return text;
  return text.replace(/[.,]/g, (c) => (c === '.' ? ',' : '.'));
}

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
  lang: 'en' | 'id' = 'id'
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
 * - If < 1e-9 ETH (10^9 wei) -> "< 0.000000001"
 * - Otherwise -> exact value up to 9 decimals without trailing zeros (e.g. 0.00000012)
 */
export function formatEthFee(wei: bigint | string | number): string {
  let weiBig: bigint;
  try {
    weiBig = typeof wei === 'bigint' ? wei : BigInt(wei);
  } catch {
    return '0';
  }

  if (weiBig === 0n) return '0';

  // 1e-9 ETH = 10^9 wei (1_000_000_000n)
  if (weiBig < 1000000000n) {
    return '< 0.000000001';
  }

  const ethStr = formatEther(weiBig);
  const parts = ethStr.split('.');
  if (parts.length === 1) return parts[0];

  let dec = parts[1].slice(0, 9);
  dec = dec.replace(/0+$/, '');
  return dec ? `${parts[0]}.${dec}` : parts[0];
}

/**
 * Format asset amount:
 * - USDC: uses formatUsdcString (exact, min 2 max 6 decimals without trailing zeros)
 * - ETH: max 8 decimals without trailing zeros (e.g. 0.05, 1, 0.00012345)
 */
export function formatAssetAmount(
  amount: string | number | undefined | null,
  asset: 'USDC' | 'ETH' | string = 'USDC'
): string {
  if (amount === undefined || amount === null || amount === '') {
    return asset === 'USDC' ? '0.00' : '0';
  }

  if (asset === 'USDC') {
    return formatUsdcString(String(amount));
  }

  const cleanStr = String(amount).replace(/,/g, '').trim();

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
