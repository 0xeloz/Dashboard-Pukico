import { isAddress } from 'viem';
import { checkRecipientAddress } from './txGuards';
import { publicClient } from './viemClient';

export type RecipientInputType = 'empty' | 'address' | 'pukico_id';

export interface ParsedRecipientInput {
  type: RecipientInputType;
  raw: string;
  sanitized: string;
}

/**
 * Determine if input text is empty, an external 0x address, or a Pukico ID.
 */
export function parseRecipientInput(input: string): ParsedRecipientInput {
  const raw = (input || '').trim();
  if (raw.length === 0) {
    return { type: 'empty', raw, sanitized: '' };
  }

  if (isLikelyAddressInput(raw)) {
    const prefix = raw.slice(0, 2);
    const rest = raw.slice(2).replace(/[^0-9a-fA-F]/g, '');
    const sanitized = `${prefix}${rest}`.slice(0, 42);
    return { type: 'address', raw, sanitized };
  }

  const sanitized = raw.replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  return { type: 'pukico_id', raw, sanitized };
}

/**
 * Check if the input looks like an Ethereum address (starts with 0x case-insensitive).
 */
export function isLikelyAddressInput(input: string): boolean {
  if (!input) return false;
  const trimmed = input.trim();
  return trimmed.startsWith('0x') || trimmed.startsWith('0X');
}

export type ExternalAddressValidation =
  | { valid: true; address: `0x${string}`; hasChecksum: boolean }
  | {
      valid: false;
      reason:
        | 'incomplete'
        | 'invalid_format'
        | 'invalid_checksum'
        | 'zero'
        | 'dead'
        | 'self'
        | 'usdc_contract';
    };

/**
 * Validate an external address strictly against EIP-55 checksum, hex format, and forbidden addresses.
 */
export function validateExternalAddress(
  address: string,
  senderAddress?: string | null
): ExternalAddressValidation {
  const trimmed = address.trim();

  if (!isLikelyAddressInput(trimmed)) {
    return { valid: false, reason: 'invalid_format' };
  }

  if (trimmed.length < 42) {
    return { valid: false, reason: 'incomplete' };
  }

  if (trimmed.length > 42 || !/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return { valid: false, reason: 'invalid_format' };
  }

  const hexBody = trimmed.slice(2);
  const isAllLower = hexBody === hexBody.toLowerCase();
  const isAllUpper = hexBody === hexBody.toUpperCase();
  const isMixedCase = !isAllLower && !isAllUpper;

  if (isMixedCase) {
    const passesStrict = isAddress(trimmed, { strict: true });
    if (!passesStrict) {
      return { valid: false, reason: 'invalid_checksum' };
    }
  }

  const guardResult = checkRecipientAddress(trimmed, senderAddress);
  if (!guardResult.valid) {
    const reason = guardResult.reason === 'invalid' ? 'invalid_format' : guardResult.reason;
    return { valid: false, reason };
  }

  return {
    valid: true,
    address: trimmed as `0x${string}`,
    hasChecksum: isMixedCase,
  };
}

/**
 * Detect address poisoning: first 4 and last 4 hex chars match a known address,
 * but full address is different.
 */
export function findLookalikeAddress(
  targetAddress: string,
  knownAddresses: string[]
): string | null {
  if (!targetAddress || targetAddress.length !== 42 || !targetAddress.startsWith('0x')) {
    return null;
  }

  const targetLower = targetAddress.toLowerCase();
  const targetPrefix4 = targetLower.slice(2, 6);
  const targetSuffix4 = targetLower.slice(-4);

  const seen = new Set<string>();

  for (const raw of knownAddresses) {
    if (!raw) continue;
    const clean = raw.trim().toLowerCase();
    if (clean.length !== 42 || !clean.startsWith('0x')) continue;
    if (clean === targetLower) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);

    const knownPrefix4 = clean.slice(2, 6);
    const knownSuffix4 = clean.slice(-4);

    if (knownPrefix4 === targetPrefix4 && knownSuffix4 === targetSuffix4) {
      return raw.trim();
    }
  }

  return null;
}

/**
 * Check if the address is a newly encountered address (never in user's outgoing transactions).
 */
export function isNewExternalAddress(
  targetAddress: string,
  knownOutgoingAddresses: string[]
): boolean {
  if (!targetAddress) return true;
  const targetLower = targetAddress.trim().toLowerCase();
  return !knownOutgoingAddresses.some((addr) => (addr || '').trim().toLowerCase() === targetLower);
}

export interface ContractCheckResult {
  isContract: boolean | null;
  status: 'contract' | 'eoa' | 'error';
}

/**
 * Check if an address is a smart contract by inspecting bytecode via getCode.
 */
export async function checkIsContract(
  address: string,
  client: any = publicClient,
  options: { isDemoMode?: boolean } = {}
): Promise<ContractCheckResult> {
  if (!address || !isAddress(address)) {
    return { isContract: false, status: 'eoa' };
  }

  if (options.isDemoMode) {
    const lower = address.toLowerCase();
    if (lower.endsWith('cccc') || lower.includes('contract')) {
      return { isContract: true, status: 'contract' };
    }
    return { isContract: false, status: 'eoa' };
  }

  try {
    const bytecode = await client.getCode({ address: address as `0x${string}` });
    if (bytecode && bytecode !== '0x' && bytecode !== '0x0') {
      return { isContract: true, status: 'contract' };
    }
    return { isContract: false, status: 'eoa' };
  } catch (err) {
    console.error('[externalRecipient] Error checking contract bytecode:', err);
    return { isContract: null, status: 'error' };
  }
}
