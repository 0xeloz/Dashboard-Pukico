import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';

export type ToastKind = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title?: string;
  action?: ToastAction;
  id?: string;
  persist?: boolean;
  silent?: boolean;
  duration?: number;
  messageKey?: string;
  messageParams?: Record<string, string>;
}

export interface ActiveToast {
  id: string;
  kind: ToastKind;
  message: string;
  title?: string;
  action?: ToastAction;
  duration: number;
  createdAt: number;
  persist?: boolean;
  isDismissing?: boolean;
}

export interface StoredToastNotification {
  id: string;
  kind: ToastKind;
  message: string;
  messageKey?: string;
  messageParams?: Record<string, string>;
  created_at: string;
  read: boolean;
}

interface ToastTimerRecord {
  timeoutId: number | null;
  remainingMs: number;
  totalDurationMs: number;
  lastStartedAt: number;
  isPaused: boolean;
}

export interface ToastContextType {
  toasts: ActiveToast[];
  notifications: StoredToastNotification[];
  unreadCount: number;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  loading: (message: string, options?: ToastOptions) => string;
  update: (id: string, kind: ToastKind, message: string, options?: ToastOptions) => void;
  toast: {
    success: (message: string, options?: ToastOptions) => string;
    error: (message: string, options?: ToastOptions) => string;
    warning: (message: string, options?: ToastOptions) => string;
    info: (message: string, options?: ToastOptions) => string;
    loading: (message: string, options?: ToastOptions) => string;
    update: (id: string, kind: ToastKind, message: string, options?: ToastOptions) => void;
  };
  dismissToast: (id: string) => void;
  pauseToast: (id: string) => void;
  resumeToast: (id: string) => void;
  getToastRemainingRatio: (id: string) => number;
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
  const queueRef = useRef<ActiveToast[]>([]);
  const recentDedupeRef = useRef<Map<string, number>>(new Map());

  // Reload notifications when storageId changes (e.g. login or switch wallet)
  useEffect(() => {
    setNotifications(loadStoredNotifications(storageId));
  }, [storageId]);

  // Clean timer record for an id
  const clearTimer = useCallback((id: string) => {
    const rec = timersRef.current.get(id);
    if (rec?.timeoutId) {
      window.clearTimeout(rec.timeoutId);
    }
    timersRef.current.delete(id);
  }, []);

  // Dismiss toast with smooth 200ms exit transition, then dequeue if any
  const dismissToast = useCallback(
    (id: string) => {
      clearTimer(id);

      // Trigger exit animation
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isDismissing: true } : t))
      );

      window.setTimeout(() => {
        setToasts((prev) => {
          const filtered = prev.filter((t) => t.id !== id);
          // If queue has items and we are below MAX_VISIBLE_TOASTS, take one
          if (queueRef.current.length > 0 && filtered.length < MAX_VISIBLE_TOASTS) {
            const nextToast = queueRef.current.shift()!;
            // Schedule timer for nextToast
            if (!nextToast.persist) {
              const timeoutId = window.setTimeout(() => {
                dismissToast(nextToast.id);
              }, nextToast.duration);

              timersRef.current.set(nextToast.id, {
                timeoutId,
                remainingMs: nextToast.duration,
                totalDurationMs: nextToast.duration,
                lastStartedAt: Date.now(),
                isPaused: false,
              });
            }
            return [...filtered, nextToast];
          }
          return filtered;
        });
      }, 200);
    },
    [clearTimer]
  );

  const pauseToast = useCallback((id: string) => {
    const rec = timersRef.current.get(id);
    if (!rec || rec.isPaused) return;
    if (rec.timeoutId) {
      window.clearTimeout(rec.timeoutId);
      rec.timeoutId = null;
    }
    const elapsed = Date.now() - rec.lastStartedAt;
    rec.remainingMs = Math.max(300, rec.remainingMs - elapsed);
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

  const getToastRemainingRatio = useCallback((id: string): number => {
    const rec = timersRef.current.get(id);
    if (!rec || rec.totalDurationMs <= 0) return 0;
    if (rec.isPaused) {
      return Math.max(0, Math.min(1, rec.remainingMs / rec.totalDurationMs));
    }
    const elapsed = Date.now() - rec.lastStartedAt;
    const currentRemaining = Math.max(0, rec.remainingMs - elapsed);
    return Math.max(0, Math.min(1, currentRemaining / rec.totalDurationMs));
  }, []);

  const addToast = useCallback(
    (kind: ToastKind, message: string, options?: ToastOptions): string => {
      if (!message || message.trim() === '') return '';

      const now = Date.now();
      const explicitId = options?.id;

      // Dedupe: ignore duplicate of (kind + ':' + message) within 2 seconds unless explicit id is provided
      if (!explicitId) {
        const dedupeKey = `${kind}:${message}`;
        const lastSeen = recentDedupeRef.current.get(dedupeKey);
        if (lastSeen && now - lastSeen < 2000) {
          return '';
        }
        recentDedupeRef.current.set(dedupeKey, now);
      }

      // Default durations: 6s for error/warning, 4s for success/info, persist for loading
      const defaultDuration =
        kind === 'loading'
          ? 30000
          : kind === 'error' || kind === 'warning'
          ? 6000
          : 4000;
      const duration = typeof options?.duration === 'number' ? options.duration : defaultDuration;
      const isPersist = Boolean(options?.persist || kind === 'loading');
      const isSilent = Boolean(options?.silent);

      const toastId = explicitId || `toast-${now}-${Math.random().toString(36).slice(2, 7)}`;

      const newToast: ActiveToast = {
        id: toastId,
        kind,
        message,
        title: options?.title,
        action: options?.action,
        duration,
        createdAt: now,
        persist: isPersist,
        isDismissing: false,
      };

      setToasts((prev) => {
        // If an active toast with this exact ID already exists, update it in place
        const existingIndex = prev.findIndex((t) => t.id === toastId);
        if (existingIndex >= 0) {
          clearTimer(toastId);
          if (!isPersist) {
            const timeoutId = window.setTimeout(() => {
              dismissToast(toastId);
            }, duration);

            timersRef.current.set(toastId, {
              timeoutId,
              remainingMs: duration,
              totalDurationMs: duration,
              lastStartedAt: now,
              isPaused: false,
            });
          }
          const updated = [...prev];
          updated[existingIndex] = newToast;
          return updated;
        }

        // If visible count is below max, display immediately
        if (prev.length < MAX_VISIBLE_TOASTS) {
          if (!isPersist) {
            const timeoutId = window.setTimeout(() => {
              dismissToast(toastId);
            }, duration);

            timersRef.current.set(toastId, {
              timeoutId,
              remainingMs: duration,
              totalDurationMs: duration,
              lastStartedAt: now,
              isPaused: false,
            });
          }
          return [...prev, newToast];
        }

        // Otherwise enqueue (do NOT drop)
        queueRef.current.push(newToast);
        return prev;
      });

      // Save non-silent to local notifications log (exclude loading state)
      if (!isSilent && kind !== 'loading' && storageId) {
        const notifEntry: StoredToastNotification = {
          id: `notif-${now}-${Math.random().toString(36).slice(2, 7)}`,
          kind,
          message,
          messageKey: options?.messageKey,
          messageParams: options?.messageParams,
          created_at: new Date(now).toISOString(),
          read: false,
        };

        setNotifications((prev) => {
          const updated = [notifEntry, ...prev].slice(0, MAX_STORED_NOTIFICATIONS);
          saveStoredNotifications(storageId, updated);
          return updated;
        });
      }

      return toastId;
    },
    [storageId, dismissToast, clearTimer]
  );

  // Update existing toast (e.g. from loading -> success/error)
  const update = useCallback(
    (id: string, kind: ToastKind, message: string, options?: ToastOptions) => {
      const now = Date.now();
      const defaultDuration =
        kind === 'loading' ? 30000 : kind === 'error' || kind === 'warning' ? 6000 : 4000;
      const duration = typeof options?.duration === 'number' ? options.duration : defaultDuration;
      const isPersist = Boolean(options?.persist);
      const isSilent = Boolean(options?.silent);

      clearTimer(id);

      setToasts((prev) => {
        const index = prev.findIndex((t) => t.id === id);
        if (index >= 0) {
          if (!isPersist) {
            const timeoutId = window.setTimeout(() => {
              dismissToast(id);
            }, duration);

            timersRef.current.set(id, {
              timeoutId,
              remainingMs: duration,
              totalDurationMs: duration,
              lastStartedAt: now,
              isPaused: false,
            });
          }

          const updated = [...prev];
          updated[index] = {
            id,
            kind,
            message,
            title: options?.title ?? prev[index].title,
            action: options?.action ?? prev[index].action,
            duration,
            createdAt: now,
            persist: isPersist,
            isDismissing: false,
          };
          return updated;
        }

        // If in queue, update it in queue
        const qIndex = queueRef.current.findIndex((t) => t.id === id);
        if (qIndex >= 0) {
          queueRef.current[qIndex] = {
            id,
            kind,
            message,
            title: options?.title ?? queueRef.current[qIndex].title,
            action: options?.action ?? queueRef.current[qIndex].action,
            duration,
            createdAt: now,
            persist: isPersist,
            isDismissing: false,
          };
        } else {
          // If neither visible nor queued, show as new toast
          addToast(kind, message, { ...options, id });
        }
        return prev;
      });

      // Save to notification log if non-silent and non-loading
      if (!isSilent && kind !== 'loading' && storageId) {
        const notifEntry: StoredToastNotification = {
          id: `notif-${now}-${Math.random().toString(36).slice(2, 7)}`,
          kind,
          message,
          messageKey: options?.messageKey,
          messageParams: options?.messageParams,
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
    [clearTimer, dismissToast, addToast, storageId]
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
  const loading = useCallback((msg: string, opts?: ToastOptions) => addToast('loading', msg, opts), [addToast]);

  const toast = useMemo(
    () => ({
      success,
      error,
      warning,
      info,
      loading,
      update,
    }),
    [success, error, warning, info, loading, update]
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
        loading,
        update,
        toast,
        dismissToast,
        pauseToast,
        resumeToast,
        getToastRemainingRatio,
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
