import { ENV } from './config';

export interface FriendRecord {
  pukico_id: string;
  joined_at: string;
  added_at: string;
}

export interface SearchFriendResult {
  pukico_id: string;
  joined_at?: string;
  is_friend: boolean;
}

export interface FriendProfileResult {
  found: boolean;
  pukico_id?: string;
  joined_at?: string;
  is_friend?: boolean;
  is_self?: boolean;
  error?: string;
}

export interface ApiOptions {
  privyToken?: string | null;
  isDemoMode?: boolean;
}

export type FriendErrorCode =
  | 'onboarding_required'
  | 'unauthorized'
  | 'not_found'
  | 'self'
  | 'limit'
  | 'bad_id'
  | 'server'
  | 'network';

export class FriendsApiError extends Error {
  code: FriendErrorCode;
  statusCode?: number;

  constructor(code: FriendErrorCode, message?: string, statusCode?: number) {
    super(message || code);
    this.name = 'FriendsApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// In-memory store for Demo Mode friends
// Only in Demo mode do rina and alex appear
export const DEMO_FRIENDS: FriendRecord[] = [
  {
    pukico_id: 'rina',
    joined_at: '2025-01-15T10:00:00Z',
    added_at: '2025-02-01T12:00:00Z',
  },
  {
    pukico_id: 'alex',
    joined_at: '2025-02-10T14:30:00Z',
    added_at: '2025-03-01T09:15:00Z',
  },
];

let demoFriendsStore: FriendRecord[] = [...DEMO_FRIENDS];

export function resetDemoFriends() {
  demoFriendsStore = [...DEMO_FRIENDS];
}

function buildHeaders(privyToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (privyToken) {
    headers['x-privy-token'] = privyToken;
  }
  if (ENV.SUPABASE_ANON_KEY) {
    headers['apikey'] = ENV.SUPABASE_ANON_KEY;
  }
  return headers;
}

function getEndpoint(): string {
  if (!ENV.SUPABASE_URL) {
    throw new FriendsApiError('server', 'Supabase URL is not configured.');
  }
  return `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/friends`;
}

/**
 * 1. Action "list": Fetch user's friends
 */
export async function listFriends(options: ApiOptions = {}): Promise<FriendRecord[]> {
  if (options.isDemoMode) {
    await new Promise((r) => setTimeout(r, 100));
    return [...demoFriendsStore];
  }

  const endpoint = getEndpoint();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({ action: 'list' }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errCode = (data.error || 'server') as FriendErrorCode;
      throw new FriendsApiError(errCode, data.message, res.status);
    }

    return Array.isArray(data.friends) ? data.friends : [];
  } catch (err) {
    if (err instanceof FriendsApiError) throw err;
    throw new FriendsApiError('network', (err as Error)?.message);
  }
}

/**
 * 2. Action "search": Search Pukico IDs by query (min 2 chars, max 8 results)
 */
export async function searchFriends(
  q: string,
  options: ApiOptions = {},
  signal?: AbortSignal
): Promise<SearchFriendResult[]> {
  const normalized = q.trim().toLowerCase().replace(/^@/, '');
  if (normalized.length < 2) {
    return [];
  }

  if (options.isDemoMode) {
    await new Promise((r) => setTimeout(r, 150));
    if (signal?.aborted) throw new Error('Aborted');

    // Filter demo friends first
    const results: SearchFriendResult[] = [];
    for (const f of demoFriendsStore) {
      if (f.pukico_id.includes(normalized)) {
        results.push({
          pukico_id: f.pukico_id,
          joined_at: f.joined_at,
          is_friend: true,
        });
      }
    }

    // Mock non-friend search matches if searching other usernames
    const mockUsers = ['satoshi', 'vitalik', 'budi', 'dewi', 'puki_fan'];
    for (const u of mockUsers) {
      if (u.includes(normalized) && !demoFriendsStore.some((f) => f.pukico_id === u)) {
        results.push({
          pukico_id: u,
          joined_at: '2025-01-01T00:00:00Z',
          is_friend: false,
        });
      }
    }

    return results.slice(0, 8);
  }

  const endpoint = getEndpoint();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({
        action: 'search',
        q: normalized,
      }),
      signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errCode = (data.error || 'server') as FriendErrorCode;
      throw new FriendsApiError(errCode, data.message, res.status);
    }

    const rawList: SearchFriendResult[] = Array.isArray(data.results) ? data.results : [];
    return rawList.slice(0, 8);
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw err;
    }
    if (err instanceof FriendsApiError) throw err;
    throw new FriendsApiError('network', (err as Error)?.message);
  }
}

/**
 * 3. Action "profile": Get full profile of a Pukico ID
 */
export async function getFriendProfile(
  pukicoId: string,
  options: ApiOptions = {}
): Promise<FriendProfileResult> {
  const normalized = pukicoId.trim().toLowerCase().replace(/^@/, '');

  if (options.isDemoMode) {
    await new Promise((r) => setTimeout(r, 100));
    const friend = demoFriendsStore.find((f) => f.pukico_id === normalized);
    if (friend) {
      return {
        found: true,
        pukico_id: friend.pukico_id,
        joined_at: friend.joined_at,
        is_friend: true,
        is_self: false,
      };
    }

    return {
      found: true,
      pukico_id: normalized,
      joined_at: '2025-01-20T00:00:00Z',
      is_friend: false,
      is_self: normalized === 'andika',
    };
  }

  const endpoint = getEndpoint();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({
        action: 'profile',
        pukico_id: normalized,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errCode = (data.error || 'server') as FriendErrorCode;
      throw new FriendsApiError(errCode, data.message, res.status);
    }

    return {
      found: Boolean(data.found),
      pukico_id: data.pukico_id || normalized,
      joined_at: data.joined_at,
      is_friend: Boolean(data.is_friend),
      is_self: Boolean(data.is_self),
    };
  } catch (err) {
    if (err instanceof FriendsApiError) throw err;
    throw new FriendsApiError('network', (err as Error)?.message);
  }
}

/**
 * 4. Action "add": Add a friend
 */
export async function addFriend(
  pukicoId: string,
  options: ApiOptions = {}
): Promise<{ ok: boolean }> {
  const normalized = pukicoId.trim().toLowerCase().replace(/^@/, '');

  if (options.isDemoMode) {
    await new Promise((r) => setTimeout(r, 150));
    if (!demoFriendsStore.some((f) => f.pukico_id === normalized)) {
      demoFriendsStore.unshift({
        pukico_id: normalized,
        joined_at: new Date().toISOString(),
        added_at: new Date().toISOString(),
      });
    }
    return { ok: true };
  }

  const endpoint = getEndpoint();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({
        action: 'add',
        pukico_id: normalized,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errCode = (data.error || 'server') as FriendErrorCode;
      throw new FriendsApiError(errCode, data.message, res.status);
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof FriendsApiError) throw err;
    throw new FriendsApiError('network', (err as Error)?.message);
  }
}

/**
 * 5. Action "remove": Remove a friend
 */
export async function removeFriend(
  pukicoId: string,
  options: ApiOptions = {}
): Promise<{ ok: boolean }> {
  const normalized = pukicoId.trim().toLowerCase().replace(/^@/, '');

  if (options.isDemoMode) {
    await new Promise((r) => setTimeout(r, 150));
    demoFriendsStore = demoFriendsStore.filter((f) => f.pukico_id !== normalized);
    return { ok: true };
  }

  const endpoint = getEndpoint();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({
        action: 'remove',
        pukico_id: normalized,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errCode = (data.error || 'server') as FriendErrorCode;
      throw new FriendsApiError(errCode, data.message, res.status);
    }

    return { ok: true };
  } catch (err) {
    if (err instanceof FriendsApiError) throw err;
    throw new FriendsApiError('network', (err as Error)?.message);
  }
}
