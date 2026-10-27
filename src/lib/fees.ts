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

const rawTreasuryEnv = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TREASURY_ADDRESS || '').toString().trim();
const rawFeeBpsEnv = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FEE_BPS : undefined;

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
 * Compute the service fee.
 * For asset 'USDC': fee = floor((amountUnits * bps) / 10000) then floored to multiple of 10000 units (0.01 USDC),
 * with minimum 10000 units (0.01 USDC) if fee is active (bps > 0, not exempt, amountUnits > 0).
 * For asset 'ETH': original behavior preserved (ceil division: (amountUnits * bps + 9999) / 10000).
 */
export function computeServiceFee(
  amountUnits: bigint,
  bps: number,
  isExempt = false,
  asset: 'USDC' | 'ETH' = 'USDC'
): bigint {
  if (isExempt || bps <= 0 || amountUnits <= 0n) {
    return 0n;
  }

  const bpsBig = BigInt(bps);

  if (asset === 'USDC') {
    const rawFee = (amountUnits * bpsBig) / 10000n;
    const flooredToCent = (rawFee / 10000n) * 10000n;
    return flooredToCent < 10000n ? 10000n : flooredToCent;
  }

  // ETH: ceil division: (a * bps + 9999) / 10000
  const fee = (amountUnits * bpsBig + 9999n) / 10000n;
  return fee > 0n ? fee : 1n;
}

/**
 * Calculate maximum sendable amount considering fee and optional gas reservation.
 * amount + fee <= available
 * For USDC: rounded down to multiple of 10000 units and ensures amount + fee <= balance.
 */
export function computeMaxSendable(
  totalBalanceUnits: bigint,
  bps: number,
  reserveGasUnits: bigint = 0n,
  isExempt = false,
  asset: 'USDC' | 'ETH' = 'USDC'
): bigint {
  const available = totalBalanceUnits > reserveGasUnits ? totalBalanceUnits - reserveGasUnits : 0n;
  if (available <= 0n) return 0n;

  if (asset === 'USDC') {
    if (isExempt || bps <= 0) {
      return (available / 10000n) * 10000n;
    }

    if (available < 20000n) {
      return 0n;
    }

    const bpsBig = BigInt(bps);
    let amount = (available * 10000n) / (10000n + bpsBig);
    amount = (amount / 10000n) * 10000n;

    // Ensure amount + fee <= available
    while (amount > 0n && amount + computeServiceFee(amount, bps, isExempt, 'USDC') > available) {
      amount -= 10000n;
    }

    // Try stepping up by 10000n if there is headroom because fee was floored
    while (amount + 10000n + computeServiceFee(amount + 10000n, bps, isExempt, 'USDC') <= available) {
      amount += 10000n;
    }

    return amount > 0n ? amount : 0n;
  }

  // ETH: unchanged
  if (isExempt || bps <= 0) return available;

  const bpsBig = BigInt(bps);
  let amount = (available * 10000n) / (10000n + bpsBig);

  while (amount > 0n && amount + computeServiceFee(amount, bps, isExempt, 'ETH') > available) {
    amount -= 1n;
  }

  return amount > 0n ? amount : 0n;
}

// Alias for backwards compatibility
export const maxSendableWithFee = computeMaxSendable;

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
