import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  listTxs,
  syncPendingTxs,
  type TxRecord,
  DEMO_TXS,
} from '../lib/txApi';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useT } from '../i18n';

export type TxFetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface TxContextType {
  txs: TxRecord[];
  status: TxFetchStatus;
  refreshing: boolean;
  refresh: () => Promise<void>;
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
  const { addNotification, toast } = useToast();
  const { t } = useT();

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

  const knownTxHashesRef = useRef<Set<string>>(new Set(txs.map((t) => t.tx_hash.toLowerCase())));
  const isInitialLoadRef = useRef<boolean>(true);

  // Synchronize incoming transactions with notifications
  const syncIncomingNotifications = useCallback(
    (txList: TxRecord[], isFirstCheck: boolean) => {
      for (const tx of txList) {
        const isIncoming = tx.direction === 'in' || tx.direction === 'incoming';
        if (!isIncoming) continue;

        const hashKey = tx.tx_hash.toLowerCase();
        const isNew = !knownTxHashesRef.current.has(hashKey);

        const sender = tx.counterparty || tx.from_pukico_id || 'rina';
        const notifMsg = t.notifications.receivedTransfer
          .replace('{amount}', tx.amount)
          .replace('{asset}', tx.asset)
          .replace('{sender}', sender.replace(/^@/, ''));

        // If new incoming transaction discovered during live polling, pop toast banner
        if (isNew && !isFirstCheck) {
          toast.success(notifMsg);
        }

        // Add to persistent notifications log
        addNotification({
          id: `tx-in-${tx.tx_hash.slice(0, 16)}`,
          kind: 'success',
          type: 'incoming_tx',
          title: t.notifications.incomingTransferTitle,
          message: notifMsg,
          amount: tx.amount,
          asset: tx.asset,
          counterparty: sender.replace(/^@/, ''),
          tx_hash: tx.tx_hash,
          created_at: tx.confirmed_at || tx.created_at || new Date().toISOString(),
          read: false,
        });

        knownTxHashesRef.current.add(hashKey);
      }
    },
    [t, toast, addNotification]
  );

  // Sync initial incoming transactions (including demo mode initial)
  useEffect(() => {
    if (txs.length > 0) {
      syncIncomingNotifications(txs, isInitialLoadRef.current);
      isInitialLoadRef.current = false;
    }
  }, [txs, syncIncomingNotifications]);

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

        // 1. First sync pending transactions
        await syncPendingTxs(apiOpts).catch(() => null);

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
            syncIncomingNotifications(listRes.txs, isInitialLoadRef.current);
            isInitialLoadRef.current = false;
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
  }, [isDemoMode, getAccessToken, syncIncomingNotifications]);

  // Simulate an incoming transfer (for testing / demo)
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

      const msg = t.notifications.receivedTransfer
        .replace('{amount}', amount)
        .replace('{asset}', asset)
        .replace('{sender}', sender);

      toast.success(msg);

      addNotification({
        id: `tx-in-${mockHash.slice(0, 16)}`,
        kind: 'success',
        type: 'incoming_tx',
        title: t.notifications.incomingTransferTitle,
        message: msg,
        amount,
        asset,
        counterparty: sender,
        tx_hash: mockHash,
        created_at: new Date().toISOString(),
        read: false,
      });

      knownTxHashesRef.current.add(mockHash.toLowerCase());
    },
    [t, toast, addNotification]
  );

  // Initial mount fetch
  useEffect(() => {
    if (!isDemoMode && walletAddress) {
      refresh();
    }
  }, [walletAddress, isDemoMode, refresh]);

  // Revalidate on visibilitychange or focus if data is older than 20 seconds
  useEffect(() => {
    if (isDemoMode) return;

    const handleRevalidate = () => {
      if (document.visibilityState === 'visible') {
        const age = Date.now() - (lastFetchTimeRef.current || 0);
        if (age > 20000) {
          refresh();
        }
      }
    };

    document.addEventListener('visibilitychange', handleRevalidate);
    window.addEventListener('focus', handleRevalidate);

    return () => {
      document.removeEventListener('visibilitychange', handleRevalidate);
      window.removeEventListener('focus', handleRevalidate);
    };
  }, [refresh, isDemoMode]);

  // 30s background polling while document is visible
  useEffect(() => {
    if (isDemoMode) return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }, 30000);

    return () => clearInterval(timer);
  }, [refresh, isDemoMode]);

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

  return (
    <TxContext.Provider
      value={{
        txs,
        status,
        refreshing,
        refresh,
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
