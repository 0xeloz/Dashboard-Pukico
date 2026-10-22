import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  listTxs,
  getNotifications,
  markNotificationsRead,
  syncPendingTxs,
  type TxRecord,
  type TxNotification,
  DEMO_TXS,
  DEMO_NOTIFICATIONS,
} from '../lib/txApi';
import { useAuth } from './AuthContext';

export type TxFetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface TxContextType {
  txs: TxRecord[];
  notifications: TxNotification[];
  unreadCount: number;
  status: TxFetchStatus;
  refreshing: boolean;
  refresh: () => Promise<void>;
  markRead: () => Promise<void>;
  isDemoMode: boolean;
}

const TxContext = createContext<TxContextType | null>(null);

const STORAGE_PREFIX = 'pukico_tx_cache_';

function getStorageKey(walletAddress: string): string {
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

interface StoredTxData {
  txs: TxRecord[];
  notifications: TxNotification[];
  unreadCount: number;
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

  const [notifications, setNotifications] = useState<TxNotification[]>(() => {
    if (isDemoMode) return DEMO_NOTIFICATIONS;
    if (initialCache.current) return initialCache.current.notifications;
    return [];
  });

  const [unreadCount, setUnreadCount] = useState<number>(() => {
    if (isDemoMode) return DEMO_NOTIFICATIONS.filter((n) => !n.read).length;
    if (initialCache.current) return initialCache.current.unreadCount;
    return 0;
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

  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const refresh = useCallback(async (): Promise<void> => {
    if (isDemoMode) {
      setRefreshing(true);
      await new Promise((r) => setTimeout(r, 400));
      setTxs(DEMO_TXS);
      setNotifications(DEMO_NOTIFICATIONS);
      setUnreadCount(DEMO_NOTIFICATIONS.filter((n) => !n.read).length);
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

        // 2. Fetch transaction list & notifications in parallel
        const [listRes, notifRes] = await Promise.all([
          listTxs(50, apiOpts).catch(() => ({ ok: false, txs: [] })),
          getNotifications(apiOpts).catch(() => ({ ok: false, items: [], unread: 0 })),
        ]);

        if (thisFetchId === fetchIdRef.current) {
          const now = Date.now();
          lastFetchTimeRef.current = now;

          if (listRes.ok) {
            setTxs(listRes.txs);
            txsRef.current = listRes.txs;
          }

          if (notifRes.ok) {
            setNotifications(notifRes.items);
            notificationsRef.current = notifRes.items;
            setUnreadCount(notifRes.unread);
          }

          if (listRes.ok || notifRes.ok) {
            setStatus('success');
            saveCachedTxData(currentWallet, {
              txs: listRes.ok ? listRes.txs : txsRef.current,
              notifications: notifRes.ok ? notifRes.items : notificationsRef.current,
              unreadCount: notifRes.ok ? notifRes.unread : 0,
              updatedAt: now,
            });
          } else {
            // Both failed
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

  const markRead = useCallback(async (): Promise<void> => {
    // Optimistic update
    setUnreadCount(0);
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));

    const currentWallet = walletRef.current;
    if (currentWallet) {
      saveCachedTxData(currentWallet, {
        txs: txsRef.current,
        notifications: notificationsRef.current.map((item) => ({ ...item, read: true })),
        unreadCount: 0,
        updatedAt: lastFetchTimeRef.current,
      });
    }

    if (isDemoMode) return;

    try {
      const token = getAccessToken ? await getAccessToken().catch(() => null) : null;
      await markNotificationsRead({ privyToken: token, isDemoMode });
    } catch {
      // Ignore background error
    }
  }, [isDemoMode, getAccessToken]);

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
        notifications,
        unreadCount,
        status,
        refreshing,
        refresh,
        markRead,
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
