import { getAddress, isAddress } from 'viem';

/**
 * Format an Ethereum address with EIP-55 checksum.
 * If invalid or null, returns empty string or fallback.
 */
export function formatChecksum(address?: string | null): string {
  if (!address || typeof address !== 'string') return '';
  const trimmed = address.trim();
  if (!isAddress(trimmed)) return trimmed;
  try {
    return getAddress(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * Split an Ethereum address hex body into chunks of given size (default 4).
 * Omits '0x' prefix so standard 40 hex characters result in 10 chunks of 4 characters.
 */
export function chunkAddress(address: string, size = 4): string[] {
  if (!address) return [];
  const clean = address.startsWith('0x') || address.startsWith('0X') ? address.slice(2) : address;
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size) {
    chunks.push(clean.slice(i, i + size));
  }
  return chunks;
}

export interface DiffChar {
  char: string;
  isDiff: boolean;
  index: number;
}

export interface DiffChunk {
  text: string;
  hasDiff: boolean;
  chars: DiffChar[];
}

export interface DiffResult {
  oldChars: DiffChar[];
  newChars: DiffChar[];
  oldChunks: DiffChunk[];
  newChunks: DiffChunk[];
  differentCount: number;
}

/**
 * Compare two addresses character-by-character and in 4-character chunks.
 * Flags characters that differ between the old and new addresses.
 */
export function diffChunks(oldAddress: string, newAddress: string): DiffResult {
  const oldChecksum = formatChecksum(oldAddress);
  const newChecksum = formatChecksum(newAddress);

  const maxLen = Math.max(oldChecksum.length, newChecksum.length);
  const oldChars: DiffChar[] = [];
  const newChars: DiffChar[] = [];
  let differentCount = 0;

  for (let i = 0; i < maxLen; i++) {
    const oc = oldChecksum[i] ?? '';
    const nc = newChecksum[i] ?? '';
    const isDiff = oc.toLowerCase() !== nc.toLowerCase();
    if (isDiff) differentCount++;

    if (oc) {
      oldChars.push({ char: oc, isDiff, index: i });
    }
    if (nc) {
      newChars.push({ char: nc, isDiff, index: i });
    }
  }

  const buildChunks = (chars: DiffChar[]): DiffChunk[] => {
    // Strip '0x' if present for chunking
    const bodyChars =
      chars.length >= 2 && chars[0]?.char.toLowerCase() === '0' && chars[1]?.char.toLowerCase() === 'x'
        ? chars.slice(2)
        : chars;

    const chunks: DiffChunk[] = [];
    for (let i = 0; i < bodyChars.length; i += 4) {
      const slice = bodyChars.slice(i, i + 4);
      chunks.push({
        text: slice.map((c) => c.char).join(''),
        hasDiff: slice.some((c) => c.isDiff),
        chars: slice,
      });
    }
    return chunks;
  };

  return {
    oldChars,
    newChars,
    oldChunks: buildChunks(oldChars),
    newChunks: buildChunks(newChars),
    differentCount,
  };
}

/**
 * Standard Levenshtein distance between two strings.
 * Ignores case and leading '@'.
 */
export function levenshtein(a: string, b: string): number {
  const s1 = a.toLowerCase().trim().replace(/^@/, '');
  const s2 = b.toLowerCase().trim().replace(/^@/, '');

  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Find lookalike recipient ID from a list of known IDs (friends + previous recipients).
 * Triggers ONLY if target is not already in knownIds and has a Levenshtein distance <= 2.
 */
export function findLookalike(recipientId: string, knownIds: string[]): string | null {
  const target = recipientId.toLowerCase().trim().replace(/^@/, '');
  if (!target || target.length < 3) return null;

  const normalizedKnown = Array.from(
    new Set(
      knownIds
        .map((id) => (id || '').toLowerCase().trim().replace(/^@/, ''))
        .filter((id) => id.length >= 3)
    )
  );

  // If the target itself is already in known IDs, it is not a lookalike
  if (normalizedKnown.includes(target)) {
    return null;
  }

  let bestMatch: string | null = null;
  let minDistance = 3; // Look only for distance <= 2

  for (const known of normalizedKnown) {
    const dist = levenshtein(target, known);
    if (dist > 0 && dist <= 2 && dist < minDistance) {
      minDistance = dist;
      bestMatch = known;
    }
  }

  return bestMatch;
}
