import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  listTxs,
  syncPendingTxs,
  getPendingTxs,
  type TxRecord,
  DEMO_TXS,
} from '../lib/txApi';
import { useAuth } from './AuthContext';

export type TxFetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface TxContextType {
  txs: TxRecord[];
  status: TxFetchStatus;
  refreshing: boolean;
  refresh: () => Promise<void>;
  updateTxRecord: (txHash: string, updates: Partial<TxRecord>) => void;
  simulateIncomingTx: (asset?: 'USDC' | 'ETH', amount?: string, sender?: string) => void;
  isDemoMode: boolean;
}


const TxContext = createContext<TxContextType | null>(null);

const STORAGE_PREFIX = 'pukico_tx_cache_';

function getStorageKey(walletAddress: string): string {
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

interface StoredTxData {
  txs: TxRecord[];
  updatedAt: number;
}

function loadCachedTxData(walletAddress: string): StoredTxData | null {
  if (!walletAddress || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getStorageKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.txs)) {
      return parsed;
    }
  } catch {
    // Ignore storage parse error
  }
  return null;
}

function saveCachedTxData(walletAddress: string, data: StoredTxData): void {
  if (!walletAddress || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(data));
  } catch {
    // Ignore storage quota error
  }
}

interface TxProviderProps {
  walletAddress: string;
  isDemoMode: boolean;
  children: React.ReactNode;
}

export function TxProvider({ walletAddress, isDemoMode, children }: TxProviderProps) {
  const { getAccessToken } = useAuth();

  // Initial cached data read
  const initialCache = useRef<StoredTxData | null>(
    !isDemoMode && walletAddress ? loadCachedTxData(walletAddress) : null
  );

  const [txs, setTxs] = useState<TxRecord[]>(() => {
    if (isDemoMode) return DEMO_TXS;
    if (initialCache.current) return initialCache.current.txs;
    return [];
  });

  const [status, setStatus] = useState<TxFetchStatus>(() => {
    if (isDemoMode) return 'success';
    if (initialCache.current) return 'idle';
    return 'loading';
  });

  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchIdRef = useRef<number>(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const lastFetchTimeRef = useRef<number>(initialCache.current ? initialCache.current.updatedAt : 0);

  const walletRef = useRef(walletAddress);
  walletRef.current = walletAddress;

  const txsRef = useRef(txs);
  txsRef.current = txs;

  const refresh = useCallback(async (): Promise<void> => {
    if (isDemoMode) {
      setRefreshing(true);
      await new Promise((r) => setTimeout(r, 400));
      setTxs(DEMO_TXS);
      setStatus('success');
      setRefreshing(false);
      return;
    }

    const currentWallet = walletRef.current;
    if (!currentWallet) return;

    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }

    const thisFetchId = ++fetchIdRef.current;
    setRefreshing(true);
    if (txsRef.current.length === 0) {
      setStatus('loading');
    }

    const promise = (async () => {
      try {
        const token = getAccessToken ? await getAccessToken().catch(() => null) : null;
        const apiOpts = { privyToken: token, isDemoMode };

        // 1. Only sync pending transactions if there are actually pending transactions
        const hasPending = getPendingTxs().length > 0 || txsRef.current.some((t) => t.status === 'pending');
        if (hasPending) {
          await syncPendingTxs(apiOpts).catch(() => null);
        }

        // 2. Fetch transaction list
        const listRes = await listTxs(50, apiOpts).catch(() => ({ ok: false, txs: [] }));

        if (thisFetchId === fetchIdRef.current) {
          const now = Date.now();
          lastFetchTimeRef.current = now;

          if (listRes.ok) {
            setTxs(listRes.txs);
            txsRef.current = listRes.txs;
            setStatus('success');
            saveCachedTxData(currentWallet, {
              txs: listRes.txs,
              updatedAt: now,
            });
          } else {
            if (txsRef.current.length === 0) {
              setStatus('error');
            }
          }
        }
      } catch {
        if (thisFetchId === fetchIdRef.current) {
          if (txsRef.current.length === 0) {
            setStatus('error');
          }
        }
      } finally {
        if (thisFetchId === fetchIdRef.current) {
          setRefreshing(false);
          inFlightPromiseRef.current = null;
        }
      }
    })();

    inFlightPromiseRef.current = promise;
    return promise;
  }, [isDemoMode, getAccessToken]);

  // Simulate an incoming transfer (for testing / demo tab in History)
  const simulateIncomingTx = useCallback(
    (asset: 'USDC' | 'ETH' = 'USDC', amount = '10.00', sender = 'rina') => {
      const mockHash = `0xsim${Date.now()}${Math.random().toString(16).slice(2, 10)}${'0'.repeat(40)}`.slice(0, 66);
      const newTx: TxRecord = {
        tx_hash: mockHash,
        direction: 'in',
        asset,
        amount,
        counterparty: sender,
        from_pukico_id: sender,
        status: 'confirmed',
        created_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        explorer_url: `https://sepolia.basescan.org/tx/${mockHash}`,
      };

      setTxs((prev) => [newTx, ...prev]);
    },
    []
  );

  // Initial mount fetch
  useEffect(() => {
    if (!isDemoMode && walletAddress) {
      refresh();
    }
  }, [walletAddress, isDemoMode, refresh]);

  // Background polling while document is visible: stops completely when hidden
  useEffect(() => {
    if (isDemoMode || !walletAddress) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
        return; // Hentikan saat tab hidden
      }

      // If pending transactions exist, poll at 30s to detect confirmation; otherwise relaxed 60s
      const hasPending = getPendingTxs().length > 0 || txsRef.current.some((t) => t.status === 'pending');
      const delay = hasPending ? 30000 : 60000;

      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await refresh();
          scheduleNext();
        }
      }, delay);
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        const age = Date.now() - (lastFetchTimeRef.current || 0);
        if (age > 45000) {
          refresh();
        }
        scheduleNext();
      } else {
        clearTimer();
      }
    };

    if (document.visibilityState === 'visible') {
      scheduleNext();
    }

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [refresh, isDemoMode, walletAddress]);

  // Listen to 'pukico:tx_updated' custom events (e.g. from Send flow)
  useEffect(() => {
    if (isDemoMode) return;

    const handleTxUpdated = () => {
      refresh();
    };

    window.addEventListener('pukico:tx_updated', handleTxUpdated);
    return () => {
      window.removeEventListener('pukico:tx_updated', handleTxUpdated);
    };
  }, [refresh, isDemoMode]);

  // Update a transaction record in local state immediately (e.g. after fee retry)
  const updateTxRecord = useCallback((txHash: string, updates: Partial<TxRecord>) => {

    setTxs((prev) =>
      prev.map((item) =>
        item.tx_hash.toLowerCase() === txHash.toLowerCase()
          ? { ...item, ...updates }
          : item
      )
    );
  }, []);

  return (
    <TxContext.Provider
      value={{
        txs,
        status,
        refreshing,
        refresh,
        updateTxRecord,
        simulateIncomingTx,
        isDemoMode,
      }}
    >
      {children}
    </TxContext.Provider>
  );

}

export function useTx(): TxContextType {
  const ctx = useContext(TxContext);
  if (!ctx) {
    throw new Error('useTx must be used within a TxProvider');
  }
  return ctx;
}
