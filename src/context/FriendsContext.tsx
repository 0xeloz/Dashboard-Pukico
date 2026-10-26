import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  listFriends,
  addFriend as apiAddFriend,
  removeFriend as apiRemoveFriend,
  FriendsApiError,
  type FriendRecord,
  DEMO_FRIENDS,
} from '../lib/friendsApi';
import { useAuth } from './AuthContext';

export type FriendsFetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface FriendsContextType {
  friends: FriendRecord[];
  status: FriendsFetchStatus;
  refreshing: boolean;
  refresh: () => Promise<void>;
  addFriend: (pukicoId: string) => Promise<{ ok: boolean; error?: string }>;
  removeFriend: (pukicoId: string) => Promise<{ ok: boolean; error?: string }>;
  isDemoMode: boolean;
  // Send Sheet global state & prefill
  isSendOpen: boolean;
  sendPrefilledId: string | null;
  openSend: (opts?: { recipientId?: string }) => void;
  closeSend: () => void;
  isSendWaitingApproval: boolean;
  setIsSendWaitingApproval: (waiting: boolean) => void;
}

const FriendsContext = createContext<FriendsContextType | null>(null);

const STORAGE_PREFIX = 'pukico_friends_cache_';

function getStorageKey(walletAddress: string): string {
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

function loadCachedFriends(walletAddress: string): FriendRecord[] | null {
  if (!walletAddress || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getStorageKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore storage parse error
  }
  return null;
}

function saveCachedFriends(walletAddress: string, data: FriendRecord[]): void {
  if (!walletAddress || typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(walletAddress), JSON.stringify(data));
  } catch {
    // Ignore storage quota error
  }
}

interface FriendsProviderProps {
  walletAddress: string;
  isDemoMode: boolean;
  children: React.ReactNode;
}

export function FriendsProvider({ walletAddress, isDemoMode, children }: FriendsProviderProps) {
  const { profile, getAccessToken } = useAuth();

  const initialCache = useRef<FriendRecord[] | null>(
    !isDemoMode && walletAddress ? loadCachedFriends(walletAddress) : null
  );

  const [friends, setFriends] = useState<FriendRecord[]>(() => {
    if (isDemoMode) {
      return [...DEMO_FRIENDS];
    }
    if (initialCache.current) {
      return initialCache.current;
    }
    return [];
  });

  const [status, setStatus] = useState<FriendsFetchStatus>(() => {
    if (isDemoMode) return 'success';
    if (initialCache.current && initialCache.current.length > 0) return 'idle';
    return 'loading';
  });

  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Send Sheet Modal controller
  const [isSendOpen, setIsSendOpen] = useState<boolean>(false);
  const [sendPrefilledId, setSendPrefilledId] = useState<string | null>(null);
  const [isSendWaitingApproval, setIsSendWaitingApproval] = useState<boolean>(false);

  const openSend = useCallback(
    (opts?: { recipientId?: string }) => {
      // Sebelum alur kirim dibuka, cek profile.beta_access dan role
      if (profile?.beta_access !== true && profile?.role !== 'admin') {
        return;
      }
      setSendPrefilledId(opts?.recipientId || null);
      setIsSendOpen(true);
    },
    [profile?.beta_access, profile?.role]
  );

  const closeSend = useCallback(() => {
    setIsSendOpen(false);
    setSendPrefilledId(null);
  }, []);

  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const lastFetchTimeRef = useRef<number>(initialCache.current ? Date.now() : 0);
  const fetchSeqRef = useRef<number>(0);

  const refresh = useCallback(async (): Promise<void> => {
    if (isDemoMode) {
      setRefreshing(true);
      await new Promise((r) => setTimeout(r, 200));
      const res = await listFriends({ isDemoMode: true });
      setFriends(res);
      setStatus('success');
      setRefreshing(false);
      return;
    }

    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }

    const seq = ++fetchSeqRef.current;
    setRefreshing(true);

    const promise = (async () => {
      try {
        const token = getAccessToken ? await getAccessToken() : null;
        const res = await listFriends({ privyToken: token, isDemoMode: false });

        if (seq === fetchSeqRef.current) {
          setFriends(res);
          setStatus('success');
          lastFetchTimeRef.current = Date.now();
          if (walletAddress) {
            saveCachedFriends(walletAddress, res);
          }
        }
      } catch {
        if (seq === fetchSeqRef.current) {
          setStatus((prev) => (friends.length > 0 ? prev : 'error'));
        }
      } finally {
        if (seq === fetchSeqRef.current) {
          setRefreshing(false);
          inFlightPromiseRef.current = null;
        }
      }
    })();

    inFlightPromiseRef.current = promise;
    return promise;
  }, [isDemoMode, walletAddress, getAccessToken, friends.length]);

  // Initial load
  useEffect(() => {
    if (isDemoMode) {
      setStatus('success');
      return;
    }
    refresh();
  }, [isDemoMode, refresh]);

  // Background SWR revalidation on tab focus/visible
  useEffect(() => {
    if (isDemoMode) return;

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        const age = Date.now() - (lastFetchTimeRef.current || 0);
        if (age > 20000) {
          refresh();
        }
      }
    };

    document.addEventListener('visibilitychange', handleFocusOrVisible);
    window.addEventListener('focus', handleFocusOrVisible);

    return () => {
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.removeEventListener('focus', handleFocusOrVisible);
    };
  }, [refresh, isDemoMode]);

  const addFriend = useCallback(
    async (pukicoId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const token = getAccessToken ? await getAccessToken() : null;
        await apiAddFriend(pukicoId, { privyToken: token, isDemoMode });
        await refresh();
        return { ok: true };
      } catch (err) {
        if (err instanceof FriendsApiError) {
          return { ok: false, error: err.code };
        }
        return { ok: false, error: 'server' };
      }
    },
    [getAccessToken, isDemoMode, refresh]
  );

  const removeFriend = useCallback(
    async (pukicoId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const token = getAccessToken ? await getAccessToken() : null;
        await apiRemoveFriend(pukicoId, { privyToken: token, isDemoMode });
        await refresh();
        return { ok: true };
      } catch (err) {
        if (err instanceof FriendsApiError) {
          return { ok: false, error: err.code };
        }
        return { ok: false, error: 'server' };
      }
    },
    [getAccessToken, isDemoMode, refresh]
  );

  return (
    <FriendsContext.Provider
      value={{
        friends,
        status,
        refreshing,
        refresh,
        addFriend,
        removeFriend,
        isDemoMode,
        isSendOpen,
        sendPrefilledId,
        openSend,
        closeSend,
        isSendWaitingApproval,
        setIsSendWaitingApproval,
      }}
    >
      {children}
    </FriendsContext.Provider>
  );
}

export function useFriends() {
  const ctx = useContext(FriendsContext);
  if (!ctx) {
    throw new Error('useFriends must be used within a FriendsProvider');
  }
  return ctx;
}
