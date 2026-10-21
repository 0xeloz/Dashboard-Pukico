import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getBaseSepoliaBalance, getBaseSepoliaUsdcBalance } from '../lib/viemClient';

export type BalanceStatus = 'idle' | 'loading' | 'refreshing' | 'error';

export interface AssetState {
  value: string | null;
  status: BalanceStatus;
  updatedAt: number | null;
  error?: string | null;
}

export interface BalanceContextType {
  usdc: AssetState;
  eth: AssetState;
  refreshing: boolean;
  refresh: () => Promise<void>;
  modifyBalance: (asset: 'usdc' | 'eth', delta: number) => void;
  isDemoMode: boolean;
}

const BalanceContext = createContext<BalanceContextType | null>(null);

const STORAGE_PREFIX = 'pukico_balances_';

function getStorageKey(walletAddress: string): string {
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

interface StoredBalances {
  usdc: string;
  eth: string;
  updatedAt: number;
}

function loadCachedBalances(walletAddress: string): StoredBalances | null {
  if (!walletAddress || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(getStorageKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.usdc === 'string' && typeof parsed.eth === 'string') {
      return parsed;
    }
  } catch {
    // Ignore storage parse error
  }
  return null;
}

function saveCachedBalances(walletAddress: string, data: StoredBalances) {
  if (!walletAddress || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(getStorageKey(walletAddress), JSON.stringify(data));
  } catch {
    // Ignore storage quota error
  }
}

interface BalanceProviderProps {
  walletAddress: string;
  isDemoMode: boolean;
  children: React.ReactNode;
}

export function BalanceProvider({ walletAddress, isDemoMode, children }: BalanceProviderProps) {
  // Stored cache read on initialization
  const initialCache = useRef<StoredBalances | null>(!isDemoMode && walletAddress ? loadCachedBalances(walletAddress) : null);

  const [usdc, setUsdc] = useState<AssetState>(() => {
    if (isDemoMode) {
      return { value: '125.50', status: 'idle', updatedAt: Date.now(), error: null };
    }
    if (initialCache.current) {
      return { value: initialCache.current.usdc, status: 'idle', updatedAt: initialCache.current.updatedAt, error: null };
    }
    return { value: null, status: 'loading', updatedAt: null, error: null };
  });

  const [eth, setEth] = useState<AssetState>(() => {
    if (isDemoMode) {
      return { value: '0.05', status: 'idle', updatedAt: Date.now(), error: null };
    }
    if (initialCache.current) {
      return { value: initialCache.current.eth, status: 'idle', updatedAt: initialCache.current.updatedAt, error: null };
    }
    return { value: null, status: 'loading', updatedAt: null, error: null };
  });

  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchIdRef = useRef<number>(0);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const lastFetchTimeRef = useRef<number>(initialCache.current ? initialCache.current.updatedAt : 0);

  // Keep latest wallet in ref for async callbacks
  const walletRef = useRef(walletAddress);
  walletRef.current = walletAddress;

  const usdcValueRef = useRef(usdc.value);
  usdcValueRef.current = usdc.value;
  const ethValueRef = useRef(eth.value);
  ethValueRef.current = eth.value;

  const refresh = useCallback(async (): Promise<void> => {
    if (isDemoMode) {
      setRefreshing(true);
      await new Promise((r) => setTimeout(r, 600));
      setUsdc({ value: '125.50', status: 'idle', updatedAt: Date.now(), error: null });
      setEth({ value: '0.05', status: 'idle', updatedAt: Date.now(), error: null });
      setRefreshing(false);
      return;
    }

    const currentWallet = walletRef.current;
    if (!currentWallet) return;

    // Join in-flight requests
    if (inFlightPromiseRef.current) {
      return inFlightPromiseRef.current;
    }

    const thisFetchId = ++fetchIdRef.current;

    // Transition statuses
    setUsdc((prev) => ({
      ...prev,
      status: prev.value !== null ? 'refreshing' : 'loading',
      error: null,
    }));
    setEth((prev) => ({
      ...prev,
      status: prev.value !== null ? 'refreshing' : 'loading',
      error: null,
    }));
    setRefreshing(true);

    const promise = (async () => {
      let usdcRes: string | null = null;
      let ethRes: string | null = null;

      try {
        const [usdcData, ethData] = await Promise.all([
          getBaseSepoliaUsdcBalance(currentWallet).catch(() => null),
          getBaseSepoliaBalance(currentWallet).catch(() => null),
        ]);
        usdcRes = usdcData;
        ethRes = ethData;
      } finally {
        if (thisFetchId === fetchIdRef.current) {
          const now = Date.now();
          lastFetchTimeRef.current = now;

          let finalUsdc = usdcValueRef.current;
          let finalEth = ethValueRef.current;

          setUsdc((prev) => {
            if (usdcRes !== null) {
              finalUsdc = usdcRes;
              return { value: usdcRes, status: 'idle', updatedAt: now, error: null };
            }
            if (prev.value !== null) {
              return { ...prev, status: 'idle', error: "Couldn't refresh" };
            }
            return { value: null, status: 'error', updatedAt: null, error: "Couldn't load balance" };
          });

          setEth((prev) => {
            if (ethRes !== null) {
              finalEth = ethRes;
              return { value: ethRes, status: 'idle', updatedAt: now, error: null };
            }
            if (prev.value !== null) {
              return { ...prev, status: 'idle', error: "Couldn't refresh" };
            }
            return { value: null, status: 'error', updatedAt: null, error: "Couldn't load balance" };
          });

          if (finalUsdc && finalEth) {
            saveCachedBalances(currentWallet, {
              usdc: finalUsdc,
              eth: finalEth,
              updatedAt: now,
            });
          }

          setRefreshing(false);
          inFlightPromiseRef.current = null;
        }
      }
    })();

    inFlightPromiseRef.current = promise;
    return promise;
  }, [isDemoMode]);

  // Initial mount fetch
  useEffect(() => {
    if (!isDemoMode && walletAddress) {
      refresh();
    }
  }, [walletAddress, isDemoMode, refresh]);

  // Visibility / focus listener (revalidate if data is older than 20 seconds)
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

  const modifyBalance = useCallback((asset: 'usdc' | 'eth', delta: number) => {
    const now = Date.now();
    if (asset === 'usdc') {
      setUsdc((prev) => {
        const currentVal = parseFloat(prev.value?.replace(/,/g, '') || '0');
        const nextVal = Math.max(0, currentVal + delta);
        const formatted = nextVal.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        if (walletRef.current) {
          saveCachedBalances(walletRef.current, {
            usdc: formatted,
            eth: ethValueRef.current || '0.0000',
            updatedAt: now,
          });
        }
        return { value: formatted, status: 'idle', updatedAt: now, error: null };
      });
    } else {
      setEth((prev) => {
        const currentVal = parseFloat(prev.value?.replace(/,/g, '') || '0');
        const nextVal = Math.max(0, currentVal + delta);
        const formatted = nextVal.toLocaleString('en-US', {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        });
        if (walletRef.current) {
          saveCachedBalances(walletRef.current, {
            usdc: usdcValueRef.current || '0.00',
            eth: formatted,
            updatedAt: now,
          });
        }
        return { value: formatted, status: 'idle', updatedAt: now, error: null };
      });
    }
  }, []);

  return (
    <BalanceContext.Provider
      value={{
        usdc,
        eth,
        refreshing,
        refresh,
        modifyBalance,
        isDemoMode,
      }}
    >
      {children}
    </BalanceContext.Provider>
  );
}

export function useBalance() {
  const ctx = useContext(BalanceContext);
  if (!ctx) {
    throw new Error('useBalance must be used within a BalanceProvider');
  }
  return ctx;
}
