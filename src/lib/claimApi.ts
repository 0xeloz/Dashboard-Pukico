import { ENV } from './config';

export type CheckStatus =
  | 'available'
  | 'yours'
  | 'taken'
  | 'held'
  | 'reserved'
  | 'format';

export interface InitClaimResponse {
  held_id: string | null;
  on_waitlist: boolean;
}

export type ClaimError =
  | 'taken'
  | 'held'
  | 'reserved'
  | 'format'
  | 'already_claimed'
  | 'no_profile'
  | 'unauthorized'
  | 'email_unverified'
  | 'server'
  | 'bad_request'
  | 'network';

export type ClaimResult =
  | { ok: true; pukico_id: string }
  | { ok: false; error: ClaimError };

interface ApiRequestOptions {
  privyToken?: string | null;
  isDemoMode?: boolean;
}

export function validatePukicoIdFormat(id: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(id);
}

/**
 * 1. Action "init": check if user has a held ID from waitlist
 */
export async function initClaim({
  privyToken,
  isDemoMode = false,
}: ApiRequestOptions): Promise<InitClaimResponse> {
  if (isDemoMode) {
    // Demo mode: local static response
    return {
      held_id: null,
      on_waitlist: false,
    };
  }

  if (!ENV.SUPABASE_URL) {
    throw new Error('Supabase URL is not configured.');
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/claim-pukico-id`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (privyToken) {
    headers['x-privy-token'] = privyToken;
  }
  if (ENV.SUPABASE_ANON_KEY) {
    headers['apikey'] = ENV.SUPABASE_ANON_KEY;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'init' }),
  });

  if (!res.ok) {
    throw new Error(`Init failed with status ${res.status}`);
  }

  const data = await res.json();
  return {
    held_id: data.held_id ?? null,
    on_waitlist: Boolean(data.on_waitlist),
  };
}

/**
 * 2. Action "check": check availability of a chosen ID
 */
export async function checkPukicoIdAvailability(
  pukicoId: string,
  { privyToken, isDemoMode = false }: ApiRequestOptions,
  signal?: AbortSignal
): Promise<CheckStatus> {
  const normalized = pukicoId.toLowerCase().trim();

  if (!validatePukicoIdFormat(normalized)) {
    return 'format';
  }

  if (isDemoMode) {
    // Demo Mode local static response
    await new Promise((r) => setTimeout(r, 120));
    if (signal?.aborted) throw new Error('Aborted');

    if (['taken', 'satoshi', 'admin'].includes(normalized)) {
      return 'taken';
    }
    if (normalized === 'held') {
      return 'held';
    }
    if (normalized === 'reserved') {
      return 'reserved';
    }
    if (normalized === 'rina') {
      return 'yours';
    }
    return 'available';
  }

  if (!ENV.SUPABASE_URL) {
    return 'available';
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/claim-pukico-id`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (privyToken) {
    headers['x-privy-token'] = privyToken;
  }
  if (ENV.SUPABASE_ANON_KEY) {
    headers['apikey'] = ENV.SUPABASE_ANON_KEY;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: 'check',
      pukico_id: normalized,
    }),
    signal,
  });

  if (!res.ok) {
    return 'format';
  }

  const data = await res.json();
  const status: CheckStatus = data.status || 'available';
  return status;
}

/**
 * 3. Action "claim": claim the Pukico ID permanently
 */
export async function claimPukicoId(
  pukicoId: string,
  { privyToken, isDemoMode = false }: ApiRequestOptions
): Promise<ClaimResult> {
  const normalized = pukicoId.toLowerCase().trim();

  if (!validatePukicoIdFormat(normalized)) {
    return { ok: false, error: 'format' };
  }

  if (isDemoMode) {
    // Demo mode: local static response
    await new Promise((r) => setTimeout(r, 450));
    if (['taken', 'satoshi'].includes(normalized)) {
      return { ok: false, error: 'taken' };
    }
    return { ok: true, pukico_id: normalized };
  }

  if (!ENV.SUPABASE_URL) {
    return { ok: false, error: 'server' };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/claim-pukico-id`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (privyToken) {
    headers['x-privy-token'] = privyToken;
  }
  if (ENV.SUPABASE_ANON_KEY) {
    headers['apikey'] = ENV.SUPABASE_ANON_KEY;
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'claim',
        pukico_id: normalized,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) {
        return { ok: false, error: 'unauthorized' };
      }
      if (res.status === 403 && data.error === 'email_unverified') {
        return { ok: false, error: 'email_unverified' };
      }
      const err = data.error || (res.status >= 500 ? 'server' : 'bad_request');
      return { ok: false, error: err };
    }

    if (data.ok && data.pukico_id) {
      return { ok: true, pukico_id: data.pukico_id };
    }

    return { ok: false, error: data.error || 'server' };
  } catch (_e) {
    return { ok: false, error: 'network' };
  }
}
