import {
  isAddress,
  encodeFunctionData,
  erc20Abi,
  parseUnits,
  type PublicClient,
} from 'viem';
import { publicClient, BASE_SEPOLIA_USDC_ADDRESS } from './viemClient';
import { CHAIN_CONFIG } from './config';

export type AssetType = 'USDC' | 'ETH';

export const ASSET_DECIMALS: Record<AssetType, number> = {
  USDC: 6,
  ETH: 18,
};

export const LARGE_TRANSFER_THRESHOLD: Record<AssetType, bigint> = {
  USDC: parseUnits('100', 6), // 100 USDC = 100_000_000n
  ETH: parseUnits('0.1', 18), // 0.1 ETH = 100_000_000_000_000_000n
};

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const DEAD_ADDRESS_PATTERN = /^0x0*dead$/i;

/**
 * Compare two addresses safely (case-insensitive).
 */
export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  if (!isAddress(a) || !isAddress(b)) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export type RecipientCheckResult =
  | { valid: true }
  | {
      valid: false;
      reason: 'invalid' | 'zero' | 'dead' | 'self' | 'usdc_contract';
    };

/**
 * Validate recipient address against zero, dead, self, and USDC contract addresses.
 */
export function checkRecipientAddress(
  address: string,
  senderAddress?: string | null
): RecipientCheckResult {
  if (!address || !isAddress(address)) {
    return { valid: false, reason: 'invalid' };
  }

  const normalized = address.toLowerCase();

  if (normalized === ZERO_ADDRESS.toLowerCase()) {
    return { valid: false, reason: 'zero' };
  }

  if (DEAD_ADDRESS_PATTERN.test(normalized)) {
    return { valid: false, reason: 'dead' };
  }

  if (senderAddress && sameAddress(address, senderAddress)) {
    return { valid: false, reason: 'self' };
  }

  if (sameAddress(address, BASE_SEPOLIA_USDC_ADDRESS)) {
    return { valid: false, reason: 'usdc_contract' };
  }

  return { valid: true };
}

/**
 * Fetch exact bigint balances directly from chain (ETH & USDC).
 */
export async function fetchExactBalances(
  address: string,
  client: PublicClient = publicClient as unknown as PublicClient
): Promise<{ eth: bigint; usdc: bigint }> {
  if (!address || !isAddress(address)) {
    return { eth: 0n, usdc: 0n };
  }

  const target = address as `0x${string}`;

  try {
    const [ethBal, usdcBal] = await Promise.all([
      client.getBalance({ address: target }),
      client.readContract({
        address: BASE_SEPOLIA_USDC_ADDRESS as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [target],
      }),
    ]);

    return {
      eth: ethBal,
      usdc: usdcBal,
    };
  } catch (err) {
    console.error('Failed to fetch exact on-chain balances:', err);
    throw err;
  }
}

export interface TransferRequest {
  to: `0x${string}`;
  value?: bigint;
  data?: `0x${string}`;
  chainId: number;
}

/**
 * Build request object for Viem/Privy sendTransaction.
 */
export function buildTransferRequest(
  asset: AssetType,
  recipientAddress: `0x${string}`,
  amountUnits: bigint
): TransferRequest {
  if (asset === 'ETH') {
    return {
      to: recipientAddress,
      value: amountUnits,
      chainId: CHAIN_CONFIG.id,
    };
  }

  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [recipientAddress, amountUnits],
  });

  return {
    to: BASE_SEPOLIA_USDC_ADDRESS as `0x${string}`,
    data,
    chainId: CHAIN_CONFIG.id,
  };
}

/**
 * Estimate gas ceiling / gas price on Base Sepolia.
 */
export async function getGasPriceCeiling(
  client: PublicClient = publicClient as unknown as PublicClient
): Promise<bigint> {
  try {
    const fees = await client.estimateFeesPerGas();
    const maxFee = fees.maxFeePerGas ?? fees.gasPrice ?? 1500000000n;
    // Add 20% margin
    return (maxFee * 120n) / 100n;
  } catch {
    return 2000000000n; // 2 gwei fallback
  }
}

/**
 * Simulate transfer transaction before prompting signature (using estimateGas).
 */
export async function simulateTransfer(
  client: PublicClient = publicClient as unknown as PublicClient,
  senderAddress: `0x${string}`,
  txRequest: TransferRequest
): Promise<bigint> {
  return await client.estimateGas({
    account: senderAddress,
    to: txRequest.to,
    value: txRequest.value,
    data: txRequest.data,
  });
}

/**
 * Frozen snapshot of a transaction to prevent race conditions or input mutations.
 */
export interface LockedTransfer {
  asset: AssetType;
  amountUnits: bigint;
  feeUnits: bigint;
  recipientId: string;
  recipientAddress: `0x${string}`;
  treasuryAddress: `0x${string}` | null;
  senderAddress: `0x${string}`;
  timestamp: number;
}

/**
 * Validate that a string matches a 32-byte 0x-prefixed hex transaction hash.
 */
export function isTxHash(hash: unknown): hash is `0x${string}` {
  return typeof hash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Extract transaction hash safely from various Privy/Viem result shapes.
 */
export function extractHash(result: unknown): `0x${string}` | null {
  if (!result) return null;
  if (isTxHash(result)) return result;

  if (typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (isTxHash(r.hash)) return r.hash;
    if (isTxHash(r.transactionHash)) return r.transactionHash;
  }

  return null;
}
