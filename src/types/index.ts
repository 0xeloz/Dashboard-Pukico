/**
 * Types for Pukico Dashboard
 */

export interface UserProfile {
  privy_did: string;
  email_hint: string;
  wallet_address: string;
  wallet_verified: boolean;
  pukico_id: string;
  role: 'user' | 'admin';
  beta_access: boolean;
}

export type SessionErrorType = 'unauthorized' | 'wallet_in_use' | 'server';

export interface SessionErrorInfo {
  type: SessionErrorType;
  message: string;
  statusCode?: number;
}

export type ActiveTab = 'home' | 'friends' | 'discover' | 'history' | 'settings' | 'receive' | 'dev';

export interface RpcStatusInfo {
  status: 'connected' | 'checking' | 'error';
  blockNumber: bigint | null;
  latencyMs: number | null;
  error?: string;
  chainId: number;
  networkName: string;
}
