import { ENV } from './config';

export interface ResolveIdResult {
  found: boolean;
  pukico_id?: string;
  wallet_address?: string;
  is_self?: boolean;
  reason?: string;
  error?: 'onboarding_required' | 'unauthorized' | 'server' | 'network';
}

export type FeeStatus = 'pending' | 'paid' | 'unpaid' | 'invalid' | 'none' | 'legacy' | null;

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
  network_fee_wei?: string;
  fee_tx_hash?: string;
  service_fee?: string | null;
  fee_status?: FeeStatus;
}

export interface FeeReportAssetTotal {
  paid_count: number;
  paid_amount: string;
  due_count: number;
  due_amount: string;
}

export interface FeeReportUnpaidEntry {
  tx_hash: string;
  asset: 'USDC' | 'ETH';
  from: string;
  status: string;
  expected: string;
  created_at: string;
}

export interface FeeReportResponse {
  treasury: string | null;
  fee_bps: number;
  active: boolean;
  totals: {
    USDC: FeeReportAssetTotal;
    ETH: FeeReportAssetTotal;
  };
  unpaid: FeeReportUnpaidEntry[];
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
export function buildHeaders(privyToken?: string | null): Record<string, string> {
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
    fee_tx_hash?: string;
  },
  options: ApiOptions = {}
): Promise<{ ok: boolean; status: number; tx?: TxRecord; error?: string }> {
  if (options.isDemoMode) {
    const feeBps = 50;
    let serviceFee: string | null = null;
    if (params.asset === 'USDC') {
      try {
        const rawAmount = BigInt(Math.round(parseFloat(params.amount || '0') * 1000000));
        const rawFee = (rawAmount * BigInt(feeBps)) / 10000n;
        const flooredCent = (rawFee / 10000n) * 10000n;
        const finalFeeUnits = flooredCent < 10000n ? 10000n : flooredCent;
        serviceFee = (Number(finalFeeUnits) / 1000000).toFixed(2);
      } catch {
        serviceFee = '0.02';
      }
    } else {
      serviceFee = '0.00005';
    }

    const feeTxHash = params.fee_tx_hash || '0xfee' + Math.random().toString(16).slice(2).padEnd(64, '0');

    return {
      ok: true,
      status: 200,
      tx: {
        tx_hash: params.tx_hash,
        direction: 'outgoing',
        asset: params.asset,
        amount: params.amount,
        to_pukico_id: params.to_pukico_id,
        fee_tx_hash: feeTxHash,
        service_fee: serviceFee,
        fee_status: 'paid',
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
        fee_tx_hash: params.fee_tx_hash,
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
    fee_tx_hash?: string;
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
  // a. Sent 5 USDC: fee 0.02 USDC, status 'paid'
  {
    tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    direction: 'out',
    asset: 'USDC',
    amount: '5.00',
    counterparty: 'rina',
    to_pukico_id: 'rina',
    status: 'confirmed',
    service_fee: '0.02',
    fee_status: 'paid',
    fee_tx_hash: '0xfee1111111111111111111111111111111111111111111111111111111111111',
    created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    confirmed_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    explorer_url: 'https://sepolia.basescan.org/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  },
  // d. Received 10 USDC: incoming transaction, no service fee info
  {
    tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    direction: 'in',
    asset: 'USDC',
    amount: '10.00',
    counterparty: 'rina',
    from_pukico_id: 'rina',
    status: 'confirmed',
    service_fee: null,
    fee_status: null,
    created_at: new Date(Date.now() - 51 * 60 * 1000).toISOString(),
    confirmed_at: new Date(Date.now() - 51 * 60 * 1000).toISOString(),
    explorer_url: 'https://sepolia.basescan.org/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  },
  // b. Legacy transaction: outgoing, legacy fee status (hidden service fee row)
  {
    tx_hash: '0x7777777777abcdef7777777777abcdef7777777777abcdef7777777777abcdef',
    direction: 'out',
    asset: 'ETH',
    amount: '0.01',
    counterparty: 'rina',
    to_pukico_id: 'rina',
    status: 'confirmed',
    service_fee: null,
    fee_status: 'legacy',
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    confirmed_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    explorer_url: 'https://sepolia.basescan.org/tx/0x7777777777abcdef7777777777abcdef7777777777abcdef7777777777abcdef',
  },
  // c. Failed / unpaid fee: outgoing, fee_status 'unpaid' with "Bayar sekarang" button
  {
    tx_hash: '0x9999999999abcdef9999999999abcdef9999999999abcdef9999999999abcdef',
    direction: 'out',
    asset: 'USDC',
    amount: '50.00',
    counterparty: 'rina',
    to_pukico_id: 'rina',
    status: 'confirmed',
    service_fee: '0.25',
    fee_status: 'unpaid',
    created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    confirmed_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    explorer_url: 'https://sepolia.basescan.org/tx/0x9999999999abcdef9999999999abcdef9999999999abcdef9999999999abcdef',
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
    const normalized: TxRecord[] = rawList.map((item) => {
      const isIncoming = item.direction === 'in' || item.direction === 'incoming';
      return {
        ...item,
        counterparty: item.counterparty || item.to_pukico_id || item.from_pukico_id || '',
        direction: isIncoming ? 'in' : 'out',
        explorer_url: item.explorer_url || (item.tx_hash ? getExplorerUrl(item.tx_hash) : undefined),
        // Receiver must never see service fee info
        service_fee: isIncoming ? null : (item.service_fee ?? null),
        fee_status: isIncoming ? null : (item.fee_status ?? null),
      };
    });
    return { ok: true, txs: normalized };
  } catch {
    return { ok: false, txs: [] };
  }
}

/**
 * 8. Fetch Admin Fee Report
 * Action 'fee_report' on edge function 'tx'
 */
export async function fetchFeeReport(
  token?: string | null,
  options: { isDemoMode?: boolean } = {}
): Promise<FeeReportResponse> {
  if (options.isDemoMode || !ENV.SUPABASE_URL) {
    return {
      treasury: '0x3333333333333333333333333333333333333333',
      fee_bps: 50,
      active: true,
      totals: {
        USDC: {
          paid_count: 14,
          paid_amount: '0.28',
          due_count: 1,
          due_amount: '0.25',
        },
        ETH: {
          paid_count: 8,
          paid_amount: '0.0004',
          due_count: 0,
          due_amount: '0',
        },
      },
      unpaid: [
        {
          tx_hash: '0x9999999999abcdef9999999999abcdef9999999999abcdef9999999999abcdef',
          asset: 'USDC',
          from: 'andika',
          status: 'unpaid',
          expected: '0.25',
          created_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
        },
      ],
    };
  }

  const endpoint = `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/tx`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ action: 'fee_report' }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Failed to fetch fee report (Status ${res.status})`);
    }

    return {
      treasury: data.treasury ?? null,
      fee_bps: typeof data.fee_bps === 'number' ? data.fee_bps : 0,
      active: Boolean(data.active),
      totals: {
        USDC: {
          paid_count: Number(data.totals?.USDC?.paid_count ?? 0),
          paid_amount: String(data.totals?.USDC?.paid_amount ?? '0'),
          due_count: Number(data.totals?.USDC?.due_count ?? 0),
          due_amount: String(data.totals?.USDC?.due_amount ?? '0'),
        },
        ETH: {
          paid_count: Number(data.totals?.ETH?.paid_count ?? 0),
          paid_amount: String(data.totals?.ETH?.paid_amount ?? '0'),
          due_count: Number(data.totals?.ETH?.due_count ?? 0),
          due_amount: String(data.totals?.ETH?.due_amount ?? '0'),
        },
      },
      unpaid: Array.isArray(data.unpaid) ? data.unpaid : [],
    };
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error('Failed to connect to fee report service.');
  }
}

/**
 * Helper to get Basescan explorer URL
 */
export function getExplorerUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}



/**
 * Shorten an Ethereum address to 0x1234…abcd
 */
export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address || '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

