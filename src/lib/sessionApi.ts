import { ENV } from './config';
import type { UserProfile, SessionErrorInfo } from '../types';

interface SyncSessionParams {
  privyToken: string;
  email: string;
  walletAddress: string;
}

interface SessionApiResponse {
  profile?: UserProfile;
  error?: string;
  code?: string;
  message?: string;
}

export class SessionSyncError extends Error {
  type: 'unauthorized' | 'wallet_in_use' | 'server';
  statusCode?: number;

  constructor(type: 'unauthorized' | 'wallet_in_use' | 'server', message: string, statusCode?: number) {
    super(message);
    this.name = 'SessionSyncError';
    this.type = type;
    this.statusCode = statusCode;
  }
}

/**
 * Sync session with Supabase Edge Function
 * POST to {VITE_SUPABASE_URL}/functions/v1/session
 */
export async function syncSessionWithSupabase({
  privyToken,
  email,
  walletAddress,
}: SyncSessionParams): Promise<UserProfile> {
  if (!ENV.SUPABASE_URL) {
    throw new SessionSyncError(
      'server',
      'Supabase URL is not configured in VITE_SUPABASE_URL environment variable.'
    );
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/session`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-privy-token': privyToken,
    };

    if (ENV.SUPABASE_ANON_KEY) {
      headers['apikey'] = ENV.SUPABASE_ANON_KEY;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        wallet_address: walletAddress,
      }),
    });

    const data: SessionApiResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errCode = (data.code || data.error || '').toLowerCase();
      const errMsg = data.message || data.error || response.statusText;

      if (response.status === 401 || errCode.includes('unauthorized') || errCode.includes('auth')) {
        throw new SessionSyncError(
          'unauthorized',
          errMsg || 'Unauthorized session. Access to this beta is invite-only.',
          response.status
        );
      }

      if (response.status === 409 || errCode.includes('wallet_in_use') || errCode.includes('in_use')) {
        throw new SessionSyncError(
          'wallet_in_use',
          errMsg || 'This wallet address is already linked to another Pukico account.',
          response.status
        );
      }

      throw new SessionSyncError(
        'server',
        errMsg || `Session synchronization failed (Status ${response.status}).`,
        response.status
      );
    }

    if (!data.profile) {
      throw new SessionSyncError(
        'server',
        'Server returned an invalid profile structure.'
      );
    }

    return data.profile;
  } catch (error) {
    if (error instanceof SessionSyncError) {
      throw error;
    }

    // Network error or unexpected exception
    throw new SessionSyncError(
      'server',
      error instanceof Error ? error.message : 'Network error connecting to session service.'
    );
  }
}
