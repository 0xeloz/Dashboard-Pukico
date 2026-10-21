/**
 * Environment and App Configuration
 */

/**
 * Validate Privy App ID format
 * Privy SDK strictly enforces: typeof appId === 'string' && appId.length === 25
 */
export function isValidPrivyAppId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (trimmed.length !== 25) return false;
  const lower = trimmed.toLowerCase();
  if (lower === 'mock' || lower.includes('placeholder')) return false;
  return true;
}

const rawDemoMode = (import.meta.env.VITE_DEMO_MODE || '').toString().toLowerCase().trim();
const rawPrivyAppId = (import.meta.env.VITE_PRIVY_APP_ID || '').toString().trim();

// Demo Mode is active if VITE_DEMO_MODE is 'true' or 'mock', or if no valid Privy App ID is provided
const isDemoModeActive =
  rawDemoMode === 'true' ||
  rawDemoMode === 'mock' ||
  !isValidPrivyAppId(rawPrivyAppId);

export const ENV = {
  PRIVY_APP_ID: rawPrivyAppId,
  SUPABASE_URL: (import.meta.env.VITE_SUPABASE_URL || '').toString().trim(),
  SUPABASE_ANON_KEY: (import.meta.env.VITE_SUPABASE_ANON_KEY || '').toString().trim(),
  DEMO_MODE_DEFAULT: isDemoModeActive,
  IS_VALID_PRIVY_APP_ID: isValidPrivyAppId(rawPrivyAppId),
};

export const CHAIN_CONFIG = {
  id: 84532,
  name: 'Base Sepolia',
  network: 'base-sepolia',
  testnet: true,
  rpcUrl: 'https://sepolia.base.org',
  blockExplorer: 'https://sepolia.basescan.org',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
};

export const APP_METADATA = {
  name: 'Pukico',
  version: '0.1.0-beta',
  tagline: 'Invite-only beta · Base Sepolia testnet · No real money',
  baseRpc: 'https://sepolia.base.org',
};
