import { isAddress, formatUnits } from 'viem';

export const DEMO_TREASURY_ADDRESS = '0x3333333333333333333333333333333333333333' as const;
export const DEFAULT_FEE_BPS = 50; // 0.5%
export const MAX_FEE_BPS = 500; // 5.0%

function parseFeeBps(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_FEE_BPS;
  const parsed = parseInt(String(raw).trim(), 10);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.min(parsed, MAX_FEE_BPS);
}

const rawTreasuryEnv = (import.meta.env.VITE_TREASURY_ADDRESS || '').toString().trim();
const rawFeeBpsEnv = import.meta.env.VITE_FEE_BPS;

export const CONFIGURED_TREASURY_ADDRESS =
  rawTreasuryEnv && isAddress(rawTreasuryEnv) ? (rawTreasuryEnv as `0x${string}`) : null;

export const CONFIGURED_FEE_BPS = parseFeeBps(rawFeeBpsEnv);

/**
 * Returns the effective treasury address depending on demo or live mode.
 */
export function getTreasuryAddress(isDemoMode = false): `0x${string}` | null {
  if (isDemoMode) {
    return DEMO_TREASURY_ADDRESS;
  }
  return CONFIGURED_TREASURY_ADDRESS;
}

/**
 * Returns the effective fee BPS (0 to 500).
 */
export function getFeeBps(isDemoMode = false): number {
  if (isDemoMode) {
    return CONFIGURED_FEE_BPS > 0 ? CONFIGURED_FEE_BPS : DEFAULT_FEE_BPS;
  }
  if (!CONFIGURED_TREASURY_ADDRESS) return 0;
  return CONFIGURED_FEE_BPS;
}

/**
 * Returns whether service fees are active.
 */
export function isFeeActive(isDemoMode = false): boolean {
  const treasury = getTreasuryAddress(isDemoMode);
  const bps = getFeeBps(isDemoMode);
  return Boolean(treasury && bps > 0);
}

/**
 * Check if an address matches the treasury.
 */
export function isTreasuryAddress(address?: string | null, isDemoMode = false): boolean {
  if (!address) return false;
  const treasury = getTreasuryAddress(isDemoMode);
  if (!treasury) return false;
  return address.toLowerCase() === treasury.toLowerCase();
}

/**
 * Compute the service fee with ceiling division: ceil(amount * bps / 10000).
 * Minimum 1 unit if amount > 0 and fee is active.
 * Fee is 0 if exempt (e.g. sender or recipient is treasury, or fee is inactive).
 */
export function computeServiceFee(
  amountUnits: bigint,
  bps: number,
  isExempt = false
): bigint {
  if (isExempt || bps <= 0 || amountUnits <= 0n) {
    return 0n;
  }

  const bpsBig = BigInt(bps);
  // Ceil division: (a * bps + 9999) / 10000
  const fee = (amountUnits * bpsBig + 9999n) / 10000n;
  return fee > 0n ? fee : 1n;
}

/**
 * Calculate maximum sendable amount considering fee and optional gas reservation.
 * amount + fee <= available
 */
export function maxSendableWithFee(
  totalBalanceUnits: bigint,
  bps: number,
  reserveGasUnits: bigint = 0n,
  isExempt = false
): bigint {
  const available = totalBalanceUnits > reserveGasUnits ? totalBalanceUnits - reserveGasUnits : 0n;
  if (available <= 0n) return 0n;
  if (isExempt || bps <= 0) return available;

  const bpsBig = BigInt(bps);
  // Initial estimate: available * 10000 / (10000 + bps)
  let amount = (available * 10000n) / (10000n + bpsBig);

  // Guard against ceil fee exceeding available
  while (amount > 0n && amount + computeServiceFee(amount, bps, isExempt) > available) {
    amount -= 1n;
  }

  return amount > 0n ? amount : 0n;
}

/**
 * Format bigint units to trimmed decimal string (no redundant trailing zeros, no trailing dot).
 */
export function formatUnitsTrimmed(value: bigint, decimals: number, maxDecimals?: number): string {
  const full = formatUnits(value, decimals);
  if (!full.includes('.')) return full;

  let [intPart, decPart] = full.split('.');
  if (typeof maxDecimals === 'number') {
    decPart = decPart.slice(0, maxDecimals);
  }
  decPart = decPart.replace(/0+$/, '');
  return decPart.length > 0 ? `${intPart}.${decPart}` : intPart;
}
