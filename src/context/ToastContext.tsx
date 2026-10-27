import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  persist?: boolean;
  duration?: number;
}

export interface ActiveToast {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
  createdAt: number;
}

export interface StoredToastNotification {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  created_at: string;
  read: boolean;
  tx_hash?: string;
  amount?: string;
  asset?: string;
  counterparty?: string;
  type?: 'incoming_tx' | 'outgoing_tx' | 'system';
}

interface ToastTimerRecord {
  timeoutId: number | null;
  remainingMs: number;
  lastStartedAt: number;
  isPaused: boolean;
}

export interface ToastContextType {
  toasts: ActiveToast[];
  notifications: StoredToastNotification[];
  unreadCount: number;
  toast: {
    success: (message: string, options?: ToastOptions) => void;
    error: (message: string, options?: ToastOptions) => void;
    warning: (message: string, options?: ToastOptions) => void;
    info: (message: string, options?: ToastOptions) => void;
  };
  dismissToast: (id: string) => void;
  pauseToast: (id: string) => void;
  resumeToast: (id: string) => void;
  addNotification: (
    entry: Omit<StoredToastNotification, 'id' | 'created_at' | 'read'> & {
      id?: string;
      created_at?: string;
      read?: boolean;
    }
  ) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const MAX_VISIBLE_TOASTS = 3;
const MAX_STORED_NOTIFICATIONS = 50;

function getStorageKey(storageId?: string | null): string | null {
  if (!storageId) return null;
  return `pukico.notifications.${storageId.toLowerCase()}`;
}

const DEMO_INITIAL_NOTIFICATIONS: StoredToastNotification[] = [
  {
    id: 'demo-notif-initial-1',
    kind: 'success',
    type: 'incoming_tx',
    title: 'Incoming Transfer',
    message: 'Received 0.02 ETH from @rina',
    amount: '0.02',
    asset: 'ETH',
    counterparty: 'rina',
    tx_hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    created_at: new Date(Date.now() - 51 * 60 * 1000).toISOString(),
    read: false,
  },
];

function loadStoredNotifications(storageId?: string | null): StoredToastNotification[] {
  if (typeof window === 'undefined') return [];
  const key = getStorageKey(storageId);
  if (!key) return [];

  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      // If demo mode wallet, seed initial unread incoming transfer
      if (storageId.toLowerCase() === '0x1111111111111111111111111111111111111111') {
        localStorage.setItem(key, JSON.stringify(DEMO_INITIAL_NOTIFICATIONS));
        return DEMO_INITIAL_NOTIFICATIONS;
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_STORED_NOTIFICATIONS);
    }
  } catch {
    // Ignore storage parse error
  }
  return [];
}

function saveStoredNotifications(
  storageId: string | null | undefined,
  list: StoredToastNotification[]
): void {
  if (typeof window === 'undefined') return;
  const key = getStorageKey(storageId);
  if (!key) return;

  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX_STORED_NOTIFICATIONS)));
  } catch {
    // Ignore storage quota error
  }
}

interface ToastProviderProps {
  storageId?: string | null;
  children: React.ReactNode;
}

export function ToastProvider({ storageId, children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const [notifications, setNotifications] = useState<StoredToastNotification[]>(() =>
    loadStoredNotifications(storageId)
  );

  const timersRef = useRef<Map<string, ToastTimerRecord>>(new Map());

  // Reload notifications when storageId changes (e.g. login/switch wallet)
  useEffect(() => {
    setNotifications(loadStoredNotifications(storageId));
  }, [storageId]);

  const dismissToast = useCallback((id: string) => {
    const rec = timersRef.current.get(id);
    if (rec?.timeoutId) {
      window.clearTimeout(rec.timeoutId);
    }
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pauseToast = useCallback((id: string) => {
    const rec = timersRef.current.get(id);
    if (!rec || rec.isPaused) return;
    if (rec.timeoutId) {
      window.clearTimeout(rec.timeoutId);
      rec.timeoutId = null;
    }
    const elapsed = Date.now() - rec.lastStartedAt;
    rec.remainingMs = Math.max(500, rec.remainingMs - elapsed);
    rec.isPaused = true;
  }, []);

  const resumeToast = useCallback(
    (id: string) => {
      const rec = timersRef.current.get(id);
      if (!rec || !rec.isPaused) return;
      rec.lastStartedAt = Date.now();
      rec.isPaused = false;
      rec.timeoutId = window.setTimeout(() => {
        dismissToast(id);
      }, rec.remainingMs);
    },
    [dismissToast]
  );

  const addToast = useCallback(
    (kind: ToastKind, message: string, options?: ToastOptions) => {
      const defaultDuration = kind === 'error' || kind === 'warning' ? 6000 : 4000;
      const duration = typeof options?.duration === 'number' ? options.duration : defaultDuration;
      const shouldPersist = Boolean(options?.persist);

      let createdNewToastId: string | null = null;

      // Deduplicate active toasts: if same message is already visible, reset timer
      setToasts((prev) => {
        const existing = prev.find((t) => t.message === message);
        if (existing) {
          const rec = timersRef.current.get(existing.id);
          if (rec?.timeoutId) {
            window.clearTimeout(rec.timeoutId);
          }
          const timeoutId = window.setTimeout(() => {
            dismissToast(existing.id);
          }, duration);

          timersRef.current.set(existing.id, {
            timeoutId,
            remainingMs: duration,
            lastStartedAt: Date.now(),
            isPaused: false,
          });
          return prev;
        }

        const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        createdNewToastId = toastId;

        const newToast: ActiveToast = {
          id: toastId,
          kind,
          message,
          duration,
          createdAt: Date.now(),
        };

        const next = [...prev, newToast];
        if (next.length > MAX_VISIBLE_TOASTS) {
          const dropped = next[0];
          const droppedRec = timersRef.current.get(dropped.id);
          if (droppedRec?.timeoutId) {
            window.clearTimeout(droppedRec.timeoutId);
          }
          timersRef.current.delete(dropped.id);
          return next.slice(next.length - MAX_VISIBLE_TOASTS);
        }
        return next;
      });

      // If a new toast was scheduled, bind its timer
      if (createdNewToastId) {
        const newId: string = createdNewToastId;
        const timeoutId = window.setTimeout(() => {
          dismissToast(newId);
        }, duration);

        timersRef.current.set(newId, {
          timeoutId,
          remainingMs: duration,
          lastStartedAt: Date.now(),
          isPaused: false,
        });
      }

      // 2. Persist ONLY if persist === true
      if (shouldPersist && storageId) {
        const notifEntry: StoredToastNotification = {
          id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind,
          message,
          created_at: new Date().toISOString(),
          read: false,
          type: 'system',
        };

        setNotifications((prev) => {
          const updated = [notifEntry, ...prev].slice(0, MAX_STORED_NOTIFICATIONS);
          saveStoredNotifications(storageId, updated);
          return updated;
        });
      }
    },
    [storageId, dismissToast]
  );

  const addNotification = useCallback(
    (
      entry: Omit<StoredToastNotification, 'id' | 'created_at' | 'read'> & {
        id?: string;
        created_at?: string;
        read?: boolean;
      }
    ) => {
      if (!storageId) return;

      setNotifications((prev) => {
        // Prevent duplicate if tx_hash already exists
        if (
          entry.tx_hash &&
          prev.some((n) => n.tx_hash && n.tx_hash.toLowerCase() === entry.tx_hash?.toLowerCase())
        ) {
          return prev;
        }

        // Prevent duplicate by custom id if provided
        if (entry.id && prev.some((n) => n.id === entry.id)) {
          return prev;
        }

        const newId = entry.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newItem: StoredToastNotification = {
          id: newId,
          kind: entry.kind,
          title: entry.title,
          message: entry.message,
          created_at: entry.created_at || new Date().toISOString(),
          read: entry.read ?? false,
          tx_hash: entry.tx_hash,
          amount: entry.amount,
          asset: entry.asset,
          counterparty: entry.counterparty,
          type: entry.type || 'system',
        };

        const updated = [newItem, ...prev].slice(0, MAX_STORED_NOTIFICATIONS);
        saveStoredNotifications(storageId, updated);
        return updated;
      });
    },
    [storageId]
  );

  const markNotificationRead = useCallback(
    (id: string) => {
      if (!storageId) return;
      setNotifications((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, read: true } : item));
        saveStoredNotifications(storageId, updated);
        return updated;
      });
    },
    [storageId]
  );

  const markAllRead = useCallback(() => {
    if (!storageId) return;
    setNotifications((prev) => {
      const updated = prev.map((item) => ({ ...item, read: true }));
      saveStoredNotifications(storageId, updated);
      return updated;
    });
  }, [storageId]);

  const clearAll = useCallback(() => {
    if (!storageId) return;
    setNotifications([]);
    saveStoredNotifications(storageId, []);
  }, [storageId]);

  const toast = useMemo(
    () => ({
      success: (msg: string, opts?: ToastOptions) => addToast('success', msg, opts),
      error: (msg: string, opts?: ToastOptions) => addToast('error', msg, opts),
      warning: (msg: string, opts?: ToastOptions) => addToast('warning', msg, opts),
      info: (msg: string, opts?: ToastOptions) => addToast('info', msg, opts),
    }),
    [addToast]
  );

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => {
        if (t.timeoutId) window.clearTimeout(t.timeoutId);
      });
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider
      value={{
        toasts,
        notifications,
        unreadCount,
        toast,
        dismissToast,
        pauseToast,
        resumeToast,
        addNotification,
        markNotificationRead,
        markAllRead,
        clearAll,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
