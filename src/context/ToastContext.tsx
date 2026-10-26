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
  silent?: boolean;
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
  message: string;
  created_at: string;
  read: boolean;
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
  markAllRead: () => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const MAX_VISIBLE_TOASTS = 3;
const MAX_STORED_NOTIFICATIONS = 50;
const DEDUPE_WINDOW_MS = 1000;

function getStorageKey(storageId?: string | null): string | null {
  if (!storageId) return null;
  return `pukico.notifications.${storageId.toLowerCase()}`;
}

function loadStoredNotifications(storageId?: string | null): StoredToastNotification[] {
  if (typeof window === 'undefined') return [];
  const key = getStorageKey(storageId);
  if (!key) return [];

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
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

  const lastMessageRef = useRef<{ message: string; timestamp: number } | null>(null);
  const timersRef = useRef<Map<string, number>>(new Map());

  // Reload notifications when storageId changes (e.g. login/switch wallet)
  useEffect(() => {
    setNotifications(loadStoredNotifications(storageId));
  }, [storageId]);

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (kind: ToastKind, message: string, options?: ToastOptions) => {
      const now = Date.now();

      // Deduplicate identical message within 1 second
      if (
        lastMessageRef.current &&
        lastMessageRef.current.message === message &&
        now - lastMessageRef.current.timestamp < DEDUPE_WINDOW_MS
      ) {
        return;
      }
      lastMessageRef.current = { message, timestamp: now };

      const isSilent = Boolean(options?.silent);
      const defaultDuration = kind === 'error' || kind === 'warning' ? 6000 : 4000;
      const duration = typeof options?.duration === 'number' ? options.duration : defaultDuration;

      const toastId = `toast-${now}-${Math.random().toString(36).slice(2, 7)}`;

      // 1. If not silent, show in viewport (capped at MAX_VISIBLE_TOASTS)
      if (!isSilent) {
        const newToast: ActiveToast = {
          id: toastId,
          kind,
          message,
          duration,
          createdAt: now,
        };

        setToasts((prev) => {
          const next = [...prev, newToast];
          if (next.length > MAX_VISIBLE_TOASTS) {
            // Drop oldest
            const dropped = next[0];
            const droppedTimer = timersRef.current.get(dropped.id);
            if (droppedTimer) {
              window.clearTimeout(droppedTimer);
              timersRef.current.delete(dropped.id);
            }
            return next.slice(next.length - MAX_VISIBLE_TOASTS);
          }
          return next;
        });

        // Auto dismiss timer
        const timer = window.setTimeout(() => {
          dismissToast(toastId);
        }, duration);
        timersRef.current.set(toastId, timer);
      }

      // 2. If non-silent, save to notification log
      if (!isSilent && storageId) {
        const notifEntry: StoredToastNotification = {
          id: toastId,
          kind,
          message,
          created_at: new Date(now).toISOString(),
          read: false,
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

  const toast = useMemo(
    () => ({
      success: (msg: string, opts?: ToastOptions) => addToast('success', msg, opts),
      error: (msg: string, opts?: ToastOptions) => addToast('error', msg, opts),
      warning: (msg: string, opts?: ToastOptions) => addToast('warning', msg, opts),
      info: (msg: string, opts?: ToastOptions) => addToast('info', msg, opts),
    }),
    [addToast]
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((item) => ({ ...item, read: true }));
      saveStoredNotifications(storageId, updated);
      return updated;
    });
  }, [storageId]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    saveStoredNotifications(storageId, []);
  }, [storageId]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
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
