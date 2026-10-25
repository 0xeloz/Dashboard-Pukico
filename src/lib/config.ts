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
  return trimmed.length === 25;
}

const rawPrivyAppId = (import.meta.env.VITE_PRIVY_APP_ID || '').toString().trim();
const isValidAppId = isValidPrivyAppId(rawPrivyAppId);
const demoEnvVar = (import.meta.env.VITE_DEMO_MODE || '').toString().toLowerCase();

// In production, Demo Mode is ONLY active if explicitly enabled with VITE_DEMO_MODE="true".
// The automatic fallback when Privy App ID is invalid/missing only applies in dev mode (import.meta.env.DEV) if not explicitly disabled.
const isDemoModeActive = import.meta.env.PROD
  ? demoEnvVar === 'true'
  : demoEnvVar === 'true' || (!isValidAppId && demoEnvVar !== 'false');

export const ENV = {
  PRIVY_APP_ID: rawPrivyAppId,
  SUPABASE_URL: (import.meta.env.VITE_SUPABASE_URL || '').toString().trim(),
  SUPABASE_ANON_KEY: (import.meta.env.VITE_SUPABASE_ANON_KEY || '').toString().trim(),
  IS_DEMO_MODE: isDemoModeActive,
  IS_VALID_PRIVY_APP_ID: isValidAppId,
  IS_CONFIG_MISSING: !isDemoModeActive && !isValidAppId,
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
