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
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  toast: {
    success: (message: string, options?: ToastOptions) => void;
    error: (message: string, options?: ToastOptions) => void;
    warning: (message: string, options?: ToastOptions) => void;
    info: (message: string, options?: ToastOptions) => void;
  };
  dismissToast: (id: string) => void;
  pauseToast: (id: string) => void;
  resumeToast: (id: string) => void;
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

function loadStoredNotifications(storageId?: string | null): StoredToastNotification[] {
  if (typeof window === 'undefined') return [];
  const key = getStorageKey(storageId);
  if (!key) return [];

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => item && typeof item.message === 'string' && typeof item.kind === 'string')
        .slice(0, MAX_STORED_NOTIFICATIONS);
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
  const recentMessagesRef = useRef<Map<string, number>>(new Map());

  // Reload notifications when storageId changes (e.g. login or switch wallet)
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
      if (!message || message.trim() === '') return;

      const now = Date.now();
      // Ignore duplicate of the exact same message within 1 second
      const lastSeen = recentMessagesRef.current.get(message);
      if (lastSeen && now - lastSeen < 1000) {
        return;
      }
      recentMessagesRef.current.set(message, now);

      // Default duration: 4s, 6s for error and warning
      const defaultDuration = kind === 'error' || kind === 'warning' ? 6000 : 4000;
      const duration = typeof options?.duration === 'number' ? options.duration : defaultDuration;
      const isSilent = Boolean(options?.silent);

      const toastId = `toast-${now}-${Math.random().toString(36).slice(2, 7)}`;

      setToasts((prev) => {
        const newToast: ActiveToast = {
          id: toastId,
          kind,
          message,
          duration,
          createdAt: now,
        };

        const next = [...prev, newToast];
        // Maksimal 3 toast terlihat
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

      // Bind auto-dismiss timer
      const timeoutId = window.setTimeout(() => {
        dismissToast(toastId);
      }, duration);

      timersRef.current.set(toastId, {
        timeoutId,
        remainingMs: duration,
        lastStartedAt: now,
        isPaused: false,
      });

      // Setiap toast non-silent disimpan ke localStorage (maksimal 50)
      if (!isSilent && storageId) {
        const notifEntry: StoredToastNotification = {
          id: `notif-${now}-${Math.random().toString(36).slice(2, 7)}`,
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

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((item) => ({ ...item, read: true }));
      if (storageId) {
        saveStoredNotifications(storageId, updated);
      }
      return updated;
    });
  }, [storageId]);

  const clearAll = useCallback(() => {
    setNotifications([]);
    if (storageId) {
      saveStoredNotifications(storageId, []);
    }
  }, [storageId]);

  const success = useCallback((msg: string, opts?: ToastOptions) => addToast('success', msg, opts), [addToast]);
  const error = useCallback((msg: string, opts?: ToastOptions) => addToast('error', msg, opts), [addToast]);
  const warning = useCallback((msg: string, opts?: ToastOptions) => addToast('warning', msg, opts), [addToast]);
  const info = useCallback((msg: string, opts?: ToastOptions) => addToast('info', msg, opts), [addToast]);

  const toast = useMemo(
    () => ({
      success,
      error,
      warning,
      info,
    }),
    [success, error, warning, info]
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
        success,
        error,
        warning,
        info,
        toast,
        dismissToast,
        pauseToast,
        resumeToast,
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
