import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  fetchNotifications,
  markNotificationsRead,
  type ServerNotificationItem,
} from '../lib/notificationsApi';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useTx } from './TxContext';
import { useBalance } from './BalanceContext';
import { useT } from '../i18n';
import type { TxRecord } from '../lib/txApi';

export type { ServerNotificationItem };

export interface NotificationsContextType {
  items: ServerNotificationItem[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
  clearAllServerNotifications: () => void;
  selectedTxForSheet: TxRecord | null;
  setSelectedTxForSheet: (tx: TxRecord | null) => void;
  openTxDetailsByHash: (txHash: string) => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

const SEEN_STORAGE_PREFIX = 'pukico.notif.seen.';
const CLEARED_STORAGE_PREFIX = 'pukico.notif.clearedAt.';

function getSeenStorageKey(walletAddress?: string): string | null {
  if (!walletAddress) return null;
  return `${SEEN_STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

function getClearedStorageKey(walletAddress?: string): string | null {
  if (!walletAddress) return null;
  return `${CLEARED_STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

function loadSeenIds(walletAddress?: string): Set<string> {
  if (typeof window === 'undefined' || !walletAddress) return new Set();
  const key = getSeenStorageKey(walletAddress);
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(walletAddress: string, seenSet: Set<string>): void {
  if (typeof window === 'undefined' || !walletAddress) return;
  const key = getSeenStorageKey(walletAddress);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(seenSet)));
  } catch {
    // Ignore quota errors
  }
}

function loadClearedAt(walletAddress?: string): number {
  if (typeof window === 'undefined' || !walletAddress) return 0;
  const key = getClearedStorageKey(walletAddress);
  if (!key) return 0;
  try {
    const raw = localStorage.getItem(key);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveClearedAt(walletAddress: string, timestamp: number): void {
  if (typeof window === 'undefined' || !walletAddress) return;
  const key = getClearedStorageKey(walletAddress);
  if (!key) return;
  try {
    localStorage.setItem(key, String(timestamp));
  } catch {
    // Ignore quota errors
  }
}

interface NotificationsProviderProps {
  walletAddress: string;
  isDemoMode: boolean;
  children: React.ReactNode;
}

export function NotificationsProvider({
  walletAddress,
  isDemoMode,
  children,
}: NotificationsProviderProps) {
  const { getAccessToken } = useAuth();
  const { toast } = useToast();
  const { txs, refresh: refreshTx } = useTx();
  const { refresh: refreshBalance } = useBalance();
  const { t } = useT();

  const [rawItems, setRawItems] = useState<ServerNotificationItem[]>([]);
  const [clearedAt, setClearedAt] = useState<number>(() => loadClearedAt(walletAddress));
  const [selectedTxForSheet, setSelectedTxForSheet] = useState<TxRecord | null>(null);

  const seenIdsRef = useRef<Set<string>>(loadSeenIds(walletAddress));
  const isInitialFetchRef = useRef<boolean>(true);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const walletRef = useRef(walletAddress);
  walletRef.current = walletAddress;

  // When walletAddress changes, reload seen and clearedAt
  useEffect(() => {
    seenIdsRef.current = loadSeenIds(walletAddress);
    setClearedAt(loadClearedAt(walletAddress));
    isInitialFetchRef.current = true;
    setRawItems([]);
  }, [walletAddress]);

  const openTxDetailsByHash = useCallback(
    (txHash: string) => {
      if (!txHash) return;
      const found = txs.find((t) => t.tx_hash.toLowerCase() === txHash.toLowerCase());
      if (found) {
        setSelectedTxForSheet(found);
      } else {
        const item = rawItems.find((i) => i.tx_hash.toLowerCase() === txHash.toLowerCase());
        setSelectedTxForSheet({
          tx_hash: txHash,
          direction: item?.kind === 'tx_received' ? 'in' : 'out',
          asset: item?.data.asset || 'USDC',
          amount: item?.data.amount || '0',
          counterparty: item?.data.counterparty || '',
          status: item?.kind === 'tx_failed' ? 'failed' : 'confirmed',
          created_at: item?.created_at || new Date().toISOString(),
          confirmed_at: item?.created_at || new Date().toISOString(),
          explorer_url: `https://sepolia.basescan.org/tx/${txHash}`,
        });
      }
    },
    [txs, rawItems]
  );

  const refresh = useCallback(
    async (isBackfill = false): Promise<void> => {
      const currentWallet = walletRef.current;
      if (!currentWallet) return;

      if (inFlightPromiseRef.current) {
        return inFlightPromiseRef.current;
      }

      const promise = (async () => {
        try {
          const token = getAccessToken ? await getAccessToken().catch(() => null) : null;
          const res = await fetchNotifications({
            privyToken: token,
            isDemoMode,
            backfill: isBackfill,
          });

          if (res.ok) {
            const fetched = res.items;

            // Handle seen tracking and toasts
            if (isInitialFetchRef.current) {
              // On first fetch: mark all existing as seen WITHOUT toast (avoid toast storm)
              fetched.forEach((item) => {
                seenIdsRef.current.add(item.id);
              });
              saveSeenIds(currentWallet, seenIdsRef.current);
              isInitialFetchRef.current = false;
            } else {
              // On subsequent fetches: identify NEW tx_received items
              for (const item of fetched) {
                if (!seenIdsRef.current.has(item.id)) {
                  seenIdsRef.current.add(item.id);

                  // Only show toast for incoming transfers (tx_received)
                  if (item.kind === 'tx_received') {
                    const template = t.notifications.kinds.tx_received;
                    const notifMsg = template
                      .replace('{amount}', item.data.amount)
                      .replace('{asset}', item.data.asset)
                      .replace('{counterparty}', item.data.counterparty);

                    toast.success(notifMsg, {
                      duration: 6000,
                      action: {
                        label: t.common.view || 'Lihat',
                        onClick: () => {
                          openTxDetailsByHash(item.tx_hash);
                        },
                      },
                    });

                    // Force refresh transaction feed and balances
                    refreshTx().catch(() => null);
                    refreshBalance({ force: true }).catch(() => null);
                  }
                }
              }
              saveSeenIds(currentWallet, seenIdsRef.current);
            }

            setRawItems(fetched);
          }
        } catch (_err) {
          // Ignore polling errors
        } finally {
          inFlightPromiseRef.current = null;
        }
      })();

      inFlightPromiseRef.current = promise;
      return promise;
    },
    [getAccessToken, isDemoMode, toast, t, openTxDetailsByHash, refreshTx, refreshBalance]
  );

  // Mark all server notifications as read
  const markAllRead = useCallback(async (): Promise<void> => {
    // Optimistic local state update
    setRawItems((prev) => prev.map((item) => ({ ...item, read: true })));

    try {
      const token = getAccessToken ? await getAccessToken().catch(() => null) : null;
      await markNotificationsRead({ privyToken: token, isDemoMode });
    } catch {
      // Ignore background errors
    }
  }, [getAccessToken, isDemoMode]);

  // "Hapus semua" (Clear all) hides items by saving clearedAt timestamp
  const clearAllServerNotifications = useCallback(() => {
    const now = Date.now();
    setClearedAt(now);
    saveClearedAt(walletRef.current, now);
  }, []);

  // Filter items based on clearedAt timestamp
  const visibleItems = useMemo(() => {
    if (!clearedAt) return rawItems;
    return rawItems.filter((item) => {
      const itemTime = new Date(item.created_at).getTime();
      return isNaN(itemTime) || itemTime > clearedAt;
    });
  }, [rawItems, clearedAt]);

  const unreadCount = useMemo(() => {
    return visibleItems.filter((item) => !item.read).length;
  }, [visibleItems]);

  // Initial fetch with backfill: true
  useEffect(() => {
    if (walletAddress) {
      refresh(true);
    }
  }, [walletAddress, refresh]);

  // Background polling every 20s while tab is visible
  useEffect(() => {
    if (!walletAddress) return;

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh(false);
      }
    }, 20000);

    return () => clearInterval(timer);
  }, [walletAddress, refresh]);

  // Revalidate on focus or visibilitychange
  useEffect(() => {
    if (!walletAddress) return;

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        refresh(false);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [walletAddress, refresh]);

  // Listen to 'pukico:tx_updated' custom events
  useEffect(() => {
    if (!walletAddress) return;

    const handleTxUpdated = () => {
      refresh(false);
    };

    window.addEventListener('pukico:tx_updated', handleTxUpdated);
    return () => {
      window.removeEventListener('pukico:tx_updated', handleTxUpdated);
    };
  }, [walletAddress, refresh]);

  return (
    <NotificationsContext.Provider
      value={{
        items: visibleItems,
        unreadCount,
        refresh: () => refresh(false),
        markAllRead,
        clearAllServerNotifications,
        selectedTxForSheet,
        setSelectedTxForSheet,
        openTxDetailsByHash,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return ctx;
}
