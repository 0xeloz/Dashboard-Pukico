import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  getBaseSepoliaBalanceRaw,
  getBaseSepoliaUsdcBalanceRaw,
} from '../lib/viemClient';
import { formatEthBalance, formatUsdcUnits } from '../lib/formatters';
import { formatUnits } from 'viem';

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
  ethWei: bigint | null;
  usdcRaw: bigint | null;
  refreshing: boolean;
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  refreshUntilChanged: (
    asset: 'ETH' | 'USDC',
    prevRaw: bigint | null,
    opts?: { tries?: number; intervalMs?: number }
  ) => Promise<void>;
  setOptimisticBalance: (params: {
    asset: 'USDC' | 'ETH';
    amountUnits: bigint;
    feeUnits: bigint;
    estimatedGasWei?: bigint;
  }) => void;
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
  ethWei?: string;
  usdcRaw?: string;
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
  const initialCache = useRef<StoredBalances | null>(
    !isDemoMode && walletAddress ? loadCachedBalances(walletAddress) : null
  );

  const [ethWei, setEthWei] = useState<bigint | null>(() => {
    if (isDemoMode) return 50000000000000000n; // 0.05 ETH
    if (initialCache.current?.ethWei) {
      try {
        return BigInt(initialCache.current.ethWei);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [usdcRaw, setUsdcRaw] = useState<bigint | null>(() => {
    if (isDemoMode) return 125500000n; // 125.50 USDC
    if (initialCache.current?.usdcRaw) {
      try {
        return BigInt(initialCache.current.usdcRaw);
      } catch {
        return null;
      }
    }
    return null;
  });

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

  const walletRef = useRef(walletAddress);
  walletRef.current = walletAddress;

  const ethWeiRef = useRef(ethWei);
  ethWeiRef.current = ethWei;

  const usdcRawRef = useRef(usdcRaw);
  usdcRawRef.current = usdcRaw;

  const refresh = useCallback(
    async (opts?: { force?: boolean }): Promise<void> => {
      if (isDemoMode) {
        setRefreshing(true);
        await new Promise((r) => setTimeout(r, 400));
        setEthWei(50000000000000000n);
        setUsdcRaw(125500000n);
        setUsdc({ value: '125.50', status: 'idle', updatedAt: Date.now(), error: null });
        setEth({ value: '0.05', status: 'idle', updatedAt: Date.now(), error: null });
        setRefreshing(false);
        return;
      }

      const currentWallet = walletRef.current;
      if (!currentWallet) return;

      // If force is requested and there's an in-flight request, wait for it to finish, then proceed to fetch fresh
      if (inFlightPromiseRef.current) {
        if (opts?.force) {
          try {
            await inFlightPromiseRef.current;
          } catch {
            // Ignore prior failure
          }
        } else {
          return inFlightPromiseRef.current;
        }
      }

      const thisFetchId = ++fetchIdRef.current;

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
        let rawUsdc: bigint | null = null;
        let rawEth: bigint | null = null;

        try {
          const [uBal, eBal] = await Promise.all([
            getBaseSepoliaUsdcBalanceRaw(currentWallet).catch(() => null),
            getBaseSepoliaBalanceRaw(currentWallet).catch(() => null),
          ]);
          rawUsdc = uBal;
          rawEth = eBal;
        } finally {
          if (thisFetchId === fetchIdRef.current) {
            const now = Date.now();
            lastFetchTimeRef.current = now;

            if (rawEth !== null) {
              setEthWei(rawEth);
              const formattedEth = formatEthBalance(rawEth);
              setEth({ value: formattedEth, status: 'idle', updatedAt: now, error: null });
            } else {
              setEth((prev) => ({
                ...prev,
                status: prev.value !== null ? 'idle' : 'error',
                error: prev.value !== null ? "Couldn't refresh" : "Couldn't load balance",
              }));
            }

            if (rawUsdc !== null) {
              setUsdcRaw(rawUsdc);
              const formattedUsdc = formatUsdcUnits(rawUsdc);
              setUsdc({ value: formattedUsdc, status: 'idle', updatedAt: now, error: null });
            } else {
              setUsdc((prev) => ({
                ...prev,
                status: prev.value !== null ? 'idle' : 'error',
                error: prev.value !== null ? "Couldn't refresh" : "Couldn't load balance",
              }));
            }

            if (rawEth !== null && rawUsdc !== null) {
              saveCachedBalances(currentWallet, {
                usdc: formatUsdcUnits(rawUsdc),
                eth: formatEthBalance(rawEth),
                ethWei: rawEth.toString(),
                usdcRaw: rawUsdc.toString(),
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
    },
    [isDemoMode]
  );

  // Poll until balance changes (used after tx confirmed / received)
  const refreshUntilChanged = useCallback(
    async (
      asset: 'ETH' | 'USDC',
      prevRaw: bigint | null,
      opts: { tries?: number; intervalMs?: number } = {}
    ): Promise<void> => {
      const maxTries = opts.tries ?? 5;
      const interval = opts.intervalMs ?? 2000;

      for (let i = 0; i < maxTries; i++) {
        await refresh({ force: true });
        const currentRaw = asset === 'ETH' ? ethWeiRef.current : usdcRawRef.current;
        if (prevRaw !== null && currentRaw !== null && currentRaw !== prevRaw) {
          break;
        }
        if (i < maxTries - 1) {
          await new Promise((r) => setTimeout(r, interval));
        }
      }
    },
    [refresh]
  );

  // Optimistic balance reduction after broadcast
  const setOptimisticBalance = useCallback(
    ({
      asset,
      amountUnits,
      feeUnits,
      estimatedGasWei = 0n,
    }: {
      asset: 'USDC' | 'ETH';
      amountUnits: bigint;
      feeUnits: bigint;
      estimatedGasWei?: bigint;
    }) => {
      const now = Date.now();
      if (asset === 'USDC') {
        const currentUsdc = usdcRawRef.current;
        if (currentUsdc !== null) {
          const totalDeduct = amountUnits + feeUnits;
          const newUsdcRaw = currentUsdc > totalDeduct ? currentUsdc - totalDeduct : 0n;
          setUsdcRaw(newUsdcRaw);
          const formattedUsdc = formatUsdcUnits(newUsdcRaw);
          setUsdc({ value: formattedUsdc, status: 'idle', updatedAt: now, error: null });
        }
        if (estimatedGasWei && estimatedGasWei > 0n) {
          const currentEth = ethWeiRef.current;
          if (currentEth !== null) {
            const newEthWei = currentEth > estimatedGasWei ? currentEth - estimatedGasWei : 0n;
            setEthWei(newEthWei);
            const formattedEth = formatEthBalance(newEthWei);
            setEth({ value: formattedEth, status: 'idle', updatedAt: now, error: null });
          }
        }
      } else {
        const currentEth = ethWeiRef.current;
        if (currentEth !== null) {
          const totalDeduct = amountUnits + feeUnits + estimatedGasWei;
          const newEthWei = currentEth > totalDeduct ? currentEth - totalDeduct : 0n;
          setEthWei(newEthWei);
          const formattedEth = formatEthBalance(newEthWei);
          setEth({ value: formattedEth, status: 'idle', updatedAt: now, error: null });
        }
      }
    },
    []
  );

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

  return (
    <BalanceContext.Provider
      value={{
        usdc,
        eth,
        ethWei,
        usdcRaw,
        refreshing,
        refresh,
        refreshUntilChanged,
        setOptimisticBalance,
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
