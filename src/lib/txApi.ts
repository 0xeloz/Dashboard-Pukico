import { ENV } from './config';

export interface ResolveIdResult {
  found: boolean;
  pukico_id?: string;
  wallet_address?: string;
  is_self?: boolean;
  reason?: string;
  error?: 'onboarding_required' | 'unauthorized' | 'server' | 'network';
}

export interface TxRecord {
  tx_hash: string;
  direction?: 'in' | 'out' | 'incoming' | 'outgoing';
  asset: 'USDC' | 'ETH';
  amount: string;
  counterparty?: string;
  to_pukico_id?: string;
  from_pukico_id?: string;
  status: 'pending' | 'confirmed' | 'failed';
  created_at?: string;
  confirmed_at?: string | null;
  explorer_url?: string;
}

export interface PendingTxEntry {
  tx_hash: string;
  asset: 'USDC' | 'ETH';
  to_pukico_id: string;
  amount: string;
  timestamp: number;
}

export interface ApiOptions {
  privyToken?: string | null;
  isDemoMode?: boolean;
}

const STORAGE_PENDING_TX_KEY = 'pukico.pendingTx';

/**
 * Read all pending transactions from localStorage
 */
export function getPendingTxs(): PendingTxEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_TX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Save a newly broadcasted transaction to localStorage
 */
export function savePendingTx(entry: Omit<PendingTxEntry, 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getPendingTxs();
    // Prevent duplicate hash entries
    const filtered = current.filter((item) => item.tx_hash.toLowerCase() !== entry.tx_hash.toLowerCase());
    filtered.push({
      ...entry,
      timestamp: Date.now(),
    });
    localStorage.setItem(STORAGE_PENDING_TX_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('pukico:tx_updated'));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Remove a transaction from localStorage once submit is successful
 */
export function removePendingTx(txHash: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getPendingTxs();
    const updated = current.filter((item) => item.tx_hash.toLowerCase() !== txHash.toLowerCase());
    localStorage.setItem(STORAGE_PENDING_TX_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('pukico:tx_updated'));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Construct default request headers for Supabase Edge Functions
 */
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

/**
 * 1. Resolve a Pukico ID to wallet address
 */
export async function resolvePukicoId(
  pukicoId: string,
  options: ApiOptions = {},
  signal?: AbortSignal
): Promise<ResolveIdResult> {
  const normalized = pukicoId.toLowerCase().trim().replace(/^@/, '');

  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    return { found: false, reason: 'format' };
  }

  if (options.isDemoMode) {
    // Demo Mode: static local data without calling API
    if (normalized === 'rina') {
      return {
        found: true,
        pukico_id: 'rina',
        wallet_address: '0x2222222222222222222222222222222222222222',
        is_self: false,
      };
    }
    if (normalized === 'andika') {
      return {
        found: true,
        pukico_id: 'andika',
        wallet_address: '0x1111111111111111111111111111111111111111',
        is_self: true,
      };
    }
    return {
      found: false,
      pukico_id: normalized,
    };
  }

  if (!ENV.SUPABASE_URL) {
    return { found: false, error: 'server' };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/resolve-id`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({ pukico_id: normalized }),
      signal,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) return { found: false, error: 'unauthorized' };
      if (res.status === 403 && data.error === 'onboarding_required') {
        return { found: false, error: 'onboarding_required' };
      }
      return { found: false, error: 'server' };
    }

    if (data.found) {
      return {
        found: true,
        pukico_id: data.pukico_id,
        wallet_address: data.wallet_address,
        is_self: Boolean(data.is_self),
      };
    }

    return {
      found: false,
      pukico_id: normalized,
      reason: data.reason,
    };
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      throw err;
    }
    return { found: false, error: 'network' };
  }
}

/**
 * 2. Submit a broadcasted transaction to the backend
 */
export async function submitTx(
  params: {
    tx_hash: string;
    asset: 'USDC' | 'ETH';
    to_pukico_id: string;
    amount: string;
  },
  options: ApiOptions = {}
): Promise<{ ok: boolean; status: number; tx?: TxRecord; error?: string }> {
  if (options.isDemoMode) {
    return {
      ok: true,
      status: 200,
      tx: {
        tx_hash: params.tx_hash,
        direction: 'outgoing',
        asset: params.asset,
        amount: params.amount,
        to_pukico_id: params.to_pukico_id,
        status: 'confirmed',
        created_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        explorer_url: `https://sepolia.basescan.org/tx/${params.tx_hash}`,
      },
    };
  }

  if (!ENV.SUPABASE_URL) {
    return { ok: false, status: 500, error: 'server' };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tx`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({
        action: 'submit',
        tx_hash: params.tx_hash,
        asset: params.asset,
        to_pukico_id: params.to_pukico_id,
        amount: params.amount,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 202) {
      return { ok: false, status: 202, error: data.error || 'tx_not_found_yet' };
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: data.error || 'server' };
    }

    return { ok: true, status: 200, tx: data.tx };
  } catch (_e) {
    return { ok: false, status: 0, error: 'network' };
  }
}

/**
 * 3. Submit with automatic retry for HTTP 202 (tx_not_found_yet) every 2s up to 20s
 */
export async function submitTxWithRetry(
  params: {
    tx_hash: string;
    asset: 'USDC' | 'ETH';
    to_pukico_id: string;
    amount: string;
  },
  options: ApiOptions = {}
): Promise<{ ok: boolean; tx?: TxRecord; error?: string }> {
  const maxWaitMs = 20000;
  const pollIntervalMs = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime <= maxWaitMs) {
    const res = await submitTx(params, options);

    if (res.ok && res.tx) {
      removePendingTx(params.tx_hash);
      return { ok: true, tx: res.tx };
    }

    if (res.status === 202 || res.error === 'tx_not_found_yet') {
      const elapsed = Date.now() - startTime;
      if (elapsed + pollIntervalMs > maxWaitMs) {
        break;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    // Other fatal error
    return { ok: false, error: res.error || 'server' };
  }

  // If timed out waiting for 202 resolution
  return { ok: false, error: 'tx_not_found_yet' };
}

/**
 * 4. Sync a transaction to get latest on-chain status
 */
export async function syncTx(
  txHash: string,
  options: ApiOptions = {}
): Promise<{ ok: boolean; tx?: TxRecord; error?: string }> {
  if (options.isDemoMode) {
    return {
      ok: true,
      tx: {
        tx_hash: txHash,
        direction: 'outgoing',
        asset: 'USDC',
        amount: '1.00',
        status: 'confirmed',
        explorer_url: `https://sepolia.basescan.org/tx/${txHash}`,
      },
    };
  }

  if (!ENV.SUPABASE_URL) {
    return { ok: false, error: 'server' };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tx`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({
        action: 'sync',
        tx_hash: txHash,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return { ok: false, error: data.error || 'server' };
    }

    return { ok: true, tx: data.tx };
  } catch (_e) {
    return { ok: false, error: 'network' };
  }
}

/**
 * 5. Sync pending transactions
 */
export async function syncPendingTxs(options: ApiOptions = {}): Promise<{ ok: boolean; txs?: TxRecord[] }> {
  if (options.isDemoMode || !ENV.SUPABASE_URL) {
    return { ok: true, txs: [] };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tx`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({ action: 'sync_pending' }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false };
    return { ok: true, txs: data.items || data.txs || [] };
  } catch {
    return { ok: false };
  }
}

/**
 * 6. Resubmit all pending transactions from localStorage and sync pending
 */
export async function resubmitPendingTransactions(options: ApiOptions = {}): Promise<void> {
  if (options.isDemoMode) return;

  const pending = getPendingTxs();
  if (pending.length === 0) {
    await syncPendingTxs(options);
    return;
  }

  for (const item of pending) {
    try {
      const res = await submitTx(
        {
          tx_hash: item.tx_hash,
          asset: item.asset,
          to_pukico_id: item.to_pukico_id,
          amount: item.amount,
        },
        options
      );

      if (res.ok) {
        removePendingTx(item.tx_hash);
      } else if (res.status === 400 && res.error !== 'tx_not_found_yet') {
        // Drop invalid or already processed entry
        removePendingTx(item.tx_hash);
      }
    } catch {
      // Keep in localStorage for next retry
    }
  }

  await syncPendingTxs(options);
}

export const DEMO_TXS: TxRecord[] = [
  {
    tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    direction: 'out',
    asset: 'ETH',
    amount: '0.01',
    counterparty: 'rina',
    to_pukico_id: 'rina',
    status: 'confirmed',
    created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    confirmed_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    explorer_url: 'https://sepolia.basescan.org/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  },
  {
    tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    direction: 'in',
    asset: 'ETH',
    amount: '0.02',
    counterparty: 'rina',
    from_pukico_id: 'rina',
    status: 'confirmed',
    created_at: new Date(Date.now() - 51 * 60 * 1000).toISOString(),
    confirmed_at: new Date(Date.now() - 51 * 60 * 1000).toISOString(),
    explorer_url: 'https://sepolia.basescan.org/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  },
];

/**
 * 7. List transactions
 */
export async function listTxs(
  limit = 50,
  options: ApiOptions = {}
): Promise<{ ok: boolean; txs: TxRecord[] }> {
  if (options.isDemoMode) {
    return { ok: true, txs: DEMO_TXS };
  }

  if (!ENV.SUPABASE_URL) {
    return { ok: false, txs: [] };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tx`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({ action: 'list', limit }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, txs: [] };
    const rawList: TxRecord[] = data.txs || data.items || [];
    const normalized: TxRecord[] = rawList.map((item) => ({
      ...item,
      counterparty: item.counterparty || item.to_pukico_id || item.from_pukico_id || '',
      direction:
        item.direction === 'incoming' ? 'in' : item.direction === 'outgoing' ? 'out' : item.direction || 'out',
      explorer_url: item.explorer_url || (item.tx_hash ? getExplorerUrl(item.tx_hash) : undefined),
    }));
    return { ok: true, txs: normalized };
  } catch {
    return { ok: false, txs: [] };
  }
}

/**
 * Helper to get Basescan explorer URL
 */
export function getExplorerUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}

/**
 * 8. Fetch notifications from backend
 */
export async function fetchServerNotifications(
  options: ApiOptions = {}
): Promise<{ ok: boolean; items?: any[] }> {
  if (options.isDemoMode || !ENV.SUPABASE_URL) {
    return { ok: true, items: [] };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tx`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({ action: 'notifications' }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, items: [] };
    return { ok: true, items: data.notifications || data.items || [] };
  } catch {
    return { ok: false, items: [] };
  }
}

/**
 * 9. Mark backend notifications as read
 */
export async function markServerNotificationsRead(
  options: ApiOptions = {}
): Promise<{ ok: boolean }> {
  if (options.isDemoMode || !ENV.SUPABASE_URL) {
    return { ok: true };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tx`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(options.privyToken),
      body: JSON.stringify({ action: 'mark_read' }),
    });

    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

/**
 * Shorten an Ethereum address to 0x1234…abcd
 */
export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address || '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

