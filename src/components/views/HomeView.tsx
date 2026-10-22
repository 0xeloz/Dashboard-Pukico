import React, { useState, useEffect, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Send,
  ArrowDownLeft,
  Droplet,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useBalance } from '../../context/BalanceContext';
import { UsdcTokenIcon, EthTokenIcon } from '../ui/PukicoBrand';
import { ActivityRow, type ActivityItem } from '../ui/ActivityRow';
import { BottomSheet } from '../ui/BottomSheet';
import {
  SendSheetContent,
  ReceiveSheetContent,
  FaucetSheetContent,
} from './sheets/QuickActionSheets';
import { useT } from '../../i18n';
import type { UserProfile } from '../../types';

interface HomeViewProps {
  profile: UserProfile;
  isDemoMode: boolean;
  onNavigateToHistory: () => void;
  onSheetOpenChange?: (isOpen: boolean) => void;
}

const DEMO_ACTIVITIES: ActivityItem[] = [
  {
    id: 'demo-1',
    type: 'outgoing',
    targetId: 'rina',
    timestamp: '31m',
    network: 'Base Sepolia',
    amount: '0.01',
    currency: 'ETH',
    status: 'Confirmed',
  },
  {
    id: 'demo-2',
    type: 'incoming',
    targetId: 'rina',
    timestamp: '51m',
    network: 'Base Sepolia',
    amount: '0.02',
    currency: 'ETH',
    status: 'Confirmed',
  },
];

// Module-level flag so stagger only animates on first session mount
let hasSessionLoadedHome = false;

export function HomeView({
  profile,
  isDemoMode,
  onNavigateToHistory,
  onSheetOpenChange,
}: HomeViewProps) {
  const { t, formatNumber } = useT();

  // Global SWR balances
  const { usdc, eth, refreshing, refresh } = useBalance();


  // Balance visibility state saved in localStorage
  const [isBalanceHidden, setIsBalanceHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pukico_balance_hidden') === 'true';
    } catch {
      return false;
    }
  });

  // Track initial session mount for stagger
  const [isInitialSession] = useState(() => !hasSessionLoadedHome);
  useEffect(() => {
    hasSessionLoadedHome = true;
  }, []);

  // Track balance value changes for 200ms animation
  const [balanceAnimKey, setBalanceAnimKey] = useState<number>(0);
  const prevUsdcRef = useRef<string | null>(usdc.value);

  useEffect(() => {
    if (prevUsdcRef.current !== null && usdc.value !== null && usdc.value !== prevUsdcRef.current) {
      setBalanceAnimKey((k) => k + 1);
    }
    prevUsdcRef.current = usdc.value;
  }, [usdc.value]);

  // Active Bottom Sheet ('send' | 'receive' | 'faucet' | null)
  const [activeSheet, setActiveSheet] = useState<'send' | 'receive' | 'faucet' | null>(null);

  // References to action buttons for accessibility focus return
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const receiveButtonRef = useRef<HTMLButtonElement>(null);
  const faucetButtonRef = useRef<HTMLButtonElement>(null);

  // Notify parent of sheet open/close state to smoothly hide/show bottom navbar
  useEffect(() => {
    if (activeSheet) {
      onSheetOpenChange?.(true);
    }
  }, [activeSheet, onSheetOpenChange]);

  const handleSheetClosed = () => {
    if (!activeSheet) {
      onSheetOpenChange?.(false);
    }
  };

  const toggleBalanceVisibility = () => {
    setIsBalanceHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('pukico_balance_hidden', String(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  };

  // --- Pull to Refresh (Home only, touch only) ---
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState<boolean>(false);
  const [isPullReturning, setIsPullReturning] = useState<boolean>(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  const touchStartYRef = useRef<number | null>(null);
  const isTrackingTouchRef = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only active when no sheet is open, not already refreshing, and scroll is at top
    if (activeSheet !== null || isPullRefreshing) return;
    if (window.scrollY > 0) return;

    touchStartYRef.current = e.touches[0].clientY;
    isTrackingTouchRef.current = true;
    setIsPullReturning(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isTrackingTouchRef.current || touchStartYRef.current === null) return;
    if (window.scrollY > 0) {
      isTrackingTouchRef.current = false;
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const delta = currentY - touchStartYRef.current;
    if (delta > 0) {
      // Resistance: pullDistance = 0.5 * finger distance, capped at 96px
      const dist = Math.min(96, delta * 0.5);
      setPullDistance(dist);
    } else {
      setPullDistance(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!isTrackingTouchRef.current) return;
    isTrackingTouchRef.current = false;
    touchStartYRef.current = null;

    if (pullDistance >= 64) {
      // Threshold met: stop indicator at 48px
      setPullDistance(48);
      setIsPullRefreshing(true);
      setLiveAnnouncement(t.home.refreshing);

      const startTime = Date.now();
      try {
        await refresh();
      } finally {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 600 - elapsed); // Hold for minimum 600ms
        setTimeout(() => {
          setLiveAnnouncement(t.home.updated);
          setIsPullRefreshing(false);
          setIsPullReturning(true);
          setPullDistance(0);

          setTimeout(() => {
            setIsPullReturning(false);
          }, 200);
        }, remaining);
      }
    } else if (pullDistance > 0) {
      // Below threshold: return smoothly over 200ms
      setIsPullReturning(true);
      setPullDistance(0);
      setTimeout(() => {
        setIsPullReturning(false);
      }, 200);
    }
  };

  const isUsdcInitialLoading = usdc.status === 'loading' && usdc.value === null;
  const isUsdcError = usdc.status === 'error' && usdc.value === null;
  const isEthInitialLoading = eth.status === 'loading' && eth.value === null;
  const isEthError = eth.status === 'error' && eth.value === null;

  // ETH fee row in balance card
  const showEthFeeRow = eth.status !== 'error' && (eth.value !== null || eth.status === 'loading');
  const parsedEthNum =
    eth.value !== null
      ? parseFloat(String(eth.value).replace(/,/g, '').replace('<', '').trim())
      : null;
  const isZeroEth =
    !isEthInitialLoading &&
    parsedEthNum !== null &&
    !isNaN(parsedEthNum) &&
    parsedEthNum === 0;

  const displayEthAmount = isBalanceHidden
    ? '••••'
    : isEthInitialLoading
    ? '…'
    : formatNumber(eth.value, { minDecimals: 2, maxDecimals: 4 });

  return (
    <div
      className="relative w-full max-w-[560px] mx-auto px-4 py-1 space-y-6 touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: pullDistance > 0 ? `translate3d(0, ${pullDistance}px, 0)` : undefined,
        transition: isPullReturning ? 'transform 200ms var(--ease-out)' : undefined,
      }}
    >
      {/* Screen reader live announcement */}
      <div className="sr-only" aria-live="polite">
        {liveAnnouncement}
      </div>

      {/* Pull To Refresh Indicator */}
      {(pullDistance > 0 || isPullRefreshing || isPullReturning) && (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 pointer-events-none flex items-center justify-center z-20 overflow-hidden"
          style={{
            top: `-${pullDistance}px`,
            height: `${pullDistance}px`,
            opacity: isPullRefreshing ? 1 : Math.min(1, pullDistance / 48),
          }}
        >
          <div className="w-9 h-9 rounded-full bg-white border border-[#E5E7EB] shadow-[0_4px_12px_rgba(10,11,13,0.08)] flex items-center justify-center">
            <RefreshCw
              className={`w-4 h-4 text-[#0052FF] ${
                isPullRefreshing ? 'animate-[spin_700ms_linear_infinite]' : ''
              }`}
              style={{
                transform: !isPullRefreshing ? `rotate(${(pullDistance / 64) * 360}deg)` : undefined,
              }}
            />
          </div>
        </div>
      )}

      {/* 1. KARTU SALDO */}
      <section
        aria-label={t.home.balanceSummaryAria}
        className="relative bg-[#0052FF] rounded-[24px] p-5 text-white overflow-hidden min-h-[150px] flex flex-col justify-between"
      >
        {/* Watermark: pukico-logo-white.png 120px, opasitas 0.08 di kanan bawah */}
        <div
          className="absolute -bottom-5 -right-5 pointer-events-none select-none opacity-[0.08]"
          aria-hidden="true"
        >
          <img
            src="/pukico-logo-white.png"
            alt=""
            className="w-[120px] h-[120px] object-contain"
          />
        </div>

        {/* Baris Atas */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/pukico-logo-white.png"
              alt="Pukico"
              className="w-[22px] h-[22px] object-contain"
            />
            <span className="font-semibold text-base tracking-tight text-white">
              Pukico
            </span>
          </div>

          <button
            type="button"
            onClick={toggleBalanceVisibility}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/20 text-white flex items-center justify-center transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
            aria-label={isBalanceHidden ? t.home.showBalance : t.home.hideBalance}
          >
            {isBalanceHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Tengah: Saldo */}
        <div className="relative z-10 my-auto py-1">
          {isUsdcInitialLoading ? (
            <div className="h-8 w-40 bg-white/20 rounded-lg animate-pulse" />
          ) : isUsdcError ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white/90">{t.home.couldntLoadBalance}</span>
              <button
                type="button"
                onClick={() => refresh()}
                className="px-2 py-0.5 text-xs font-semibold rounded-md bg-white text-[#0052FF] hover:bg-[#EEF4FF] transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
              >
                {t.common.retry}
              </button>
            </div>
          ) : (
            <div className="flex flex-col">
              <div key={balanceAnimKey} className="animate-balance-change flex items-baseline gap-2">
                <span className="text-[30px] font-bold tracking-tight text-white font-mono tabular-nums leading-tight transition-opacity duration-150">
                  {isBalanceHidden ? '••••' : formatNumber(usdc.value, { minDecimals: 2, maxDecimals: 2 })}
                </span>
                <span className="text-base font-semibold text-white/80">USDC</span>
              </div>
              {usdc.error && usdc.value !== null && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[11px] text-[#FDE68A] font-medium">{t.home.couldntRefresh}</span>
                  <button
                    type="button"
                    onClick={() => refresh()}
                    className="text-[11px] font-semibold text-white underline hover:no-underline cursor-pointer"
                  >
                    {t.common.retry}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bawah: Chip "Testnet · Base Sepolia" & Info Biaya ETH */}
        <div className="relative z-10 flex flex-col gap-1.5 pt-1 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-7 px-2.5 rounded-full border border-white/30 text-xs font-medium text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                <span>{t.common.testnetBaseSepolia}</span>
              </div>
            </div>

            <span className="text-[#DCE8FF] text-xs font-medium">{t.common.noMonetaryValue}</span>
          </div>

          {showEthFeeRow && (
            <div className="text-[12px] text-[#DCE8FF] flex items-center gap-1.5 leading-normal transition-opacity duration-150">
              {isZeroEth && !isBalanceHidden ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-[#FDE68A] shrink-0" />
                  <span>{t.home.needTestEth}</span>
                </>
              ) : (
                <span>
                  {t.home.ethForFees.replace('{amount}', displayEthAmount)}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 2. AKSI CEPAT */}
      <section aria-label={t.home.quickActionsAria}>
        <div className="grid grid-cols-3 w-full">
          {/* Action 1: Send */}
          <div className="flex flex-col items-center">
            <button
              ref={sendButtonRef}
              type="button"
              onClick={() => setActiveSheet('send')}
              className="w-11 h-11 rounded-[14px] bg-white border border-[#E5E7EB] hover:bg-[#EEF4FF] hover:border-[#0052FF]/30 flex items-center justify-center transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
              aria-label={t.home.send}
            >
              <Send className="w-[18px] h-[18px] text-[#0A0B0D]" />
            </button>
            <span className="text-[13px] font-medium text-[#0A0B0D] mt-1.5 whitespace-nowrap text-center">
              {t.home.send}
            </span>
          </div>

          {/* Action 2: Receive */}
          <div className="flex flex-col items-center">
            <button
              ref={receiveButtonRef}
              type="button"
              onClick={() => setActiveSheet('receive')}
              className="w-11 h-11 rounded-[14px] bg-white border border-[#E5E7EB] hover:bg-[#EEF4FF] hover:border-[#0052FF]/30 flex items-center justify-center transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
              aria-label={t.home.receive}
            >
              <ArrowDownLeft className="w-[18px] h-[18px] text-[#0A0B0D]" />
            </button>
            <span className="text-[13px] font-medium text-[#0A0B0D] mt-1.5 whitespace-nowrap text-center">
              {t.home.receive}
            </span>
          </div>

          {/* Action 3: Get test USDC */}
          <div className="flex flex-col items-center">
            <button
              ref={faucetButtonRef}
              type="button"
              onClick={() => setActiveSheet('faucet')}
              className="w-11 h-11 rounded-[14px] bg-white border border-[#E5E7EB] hover:bg-[#EEF4FF] hover:border-[#0052FF]/30 flex items-center justify-center transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
              aria-label={t.home.getTestUsdc}
            >
              <Droplet className="w-[18px] h-[18px] text-[#0052FF]" />
            </button>
            <span className="text-[13px] font-medium text-[#0A0B0D] mt-1.5 whitespace-nowrap text-center">
              {t.home.getTestUsdc}
            </span>
          </div>
        </div>
      </section>

      {/* 3. DAFTAR ASET */}
      <section
        aria-label={t.home.assetList}
        className={isInitialSession ? 'animate-fade-up [animation-delay:40ms]' : ''}
      >
        <div className="mb-2">
          <h2 className="text-[18px] font-bold text-[#0A0B0D] leading-tight">{t.home.assetList}</h2>
          <p className="text-xs text-[#5B6577] mt-0.5">{t.home.assetsOnBaseSepolia}</p>
        </div>

        <div className="divide-y divide-[#E5E7EB] border-b border-[#E5E7EB]">
          {/* Row 1: USDC */}
          <div className="flex items-center justify-between py-3.5 active:bg-[#EEF4FF] transition-colors duration-[var(--dur-tap)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-[14px] bg-[#EEF4FF] flex items-center justify-center shrink-0">
                <UsdcTokenIcon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[15px] text-[#0A0B0D]">{t.home.usdCoin}</div>
                <div className="text-xs text-[#5B6577] mt-0.5">
                  USDC · <span className="text-[#0052FF] font-medium">{t.common.baseSepolia}</span>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              {isUsdcInitialLoading ? (
                <div className="h-5 w-16 bg-slate-100 rounded animate-pulse" />
              ) : isUsdcError ? (
                <button
                  type="button"
                  onClick={() => refresh()}
                  className="text-xs text-[#B91C1C] hover:underline"
                >
                  {t.common.retry}
                </button>
              ) : (
                <>
                  <div className="font-mono text-[15px] font-bold text-[#0A0B0D] tabular-nums transition-opacity duration-150">
                    {isBalanceHidden ? '••••' : `${formatNumber(usdc.value, { minDecimals: 2, maxDecimals: 2 })} USDC`}
                  </div>
                  <div className="text-[11px] text-[#5B6577] mt-0.5">{t.common.testnet}</div>
                </>
              )}
            </div>
          </div>

          {/* Row 2: ETH */}
          <div className="flex items-center justify-between py-3.5 active:bg-[#EEF4FF] transition-colors duration-[var(--dur-tap)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-[14px] bg-[#EEF4FF] flex items-center justify-center shrink-0">
                <EthTokenIcon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[15px] text-[#0A0B0D]">{t.home.ether}</div>
                <div className="text-xs text-[#5B6577] mt-0.5">
                  ETH · <span className="text-[#0052FF] font-medium">{t.common.baseSepolia}</span>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              {isEthInitialLoading ? (
                <div className="h-5 w-16 bg-slate-100 rounded animate-pulse" />
              ) : isEthError ? (
                <button
                  type="button"
                  onClick={() => refresh()}
                  className="text-xs text-[#B91C1C] hover:underline"
                >
                  {t.common.retry}
                </button>
              ) : (
                <>
                  <div className="font-mono text-[15px] font-bold text-[#0A0B0D] tabular-nums transition-opacity duration-150">
                    {isBalanceHidden ? '••••' : `${formatNumber(eth.value, { minDecimals: 2, maxDecimals: 4 })} ETH`}
                  </div>
                  <div className="text-[11px] text-[#5B6577] mt-0.5">{t.common.testnet}</div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. AKTIVITAS TERBARU */}
      <section
        aria-label={t.home.recentActivity}
        className={isInitialSession ? 'animate-fade-up [animation-delay:80ms]' : ''}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[18px] font-bold text-[#0A0B0D]">{t.home.recentActivity}</h2>
          <button
            type="button"
            onClick={onNavigateToHistory}
            className="text-xs font-semibold text-[#0052FF] hover:text-[#0042D6] flex items-center gap-1 transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
          >
            <span>{t.home.fullHistory}</span>
            <span aria-hidden="true">&rsaquo;</span>
          </button>
        </div>

        {!isDemoMode ? (
          <div className="py-7 border-b border-[#E5E7EB] text-center">
            <p className="text-xs sm:text-sm text-[#5B6577] max-w-xs mx-auto leading-relaxed">
              {t.home.noActivity}
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between py-1 text-[11px] text-[#B45309]">
              <span className="text-[13px] font-semibold text-[#5B6577]">{t.home.previewFeed}</span>
              <span className="px-1.5 py-0.5 rounded bg-[#FFFBEB] font-bold border border-[#FDE68A]">
                {t.common.demoData}
              </span>
            </div>
            {DEMO_ACTIVITIES.map((act) => (
              <ActivityRow key={act.id} activity={act} />
            ))}
          </div>
        )}
      </section>

      {/* 5. BOTTOM SHEETS UNTUK AKSI CEPAT */}
      {/* Sheet 1: Send */}
      <BottomSheet
        open={activeSheet === 'send'}
        onClose={() => setActiveSheet(null)}
        onClosed={handleSheetClosed}
        title={t.sheets.send.title}
        triggerRef={sendButtonRef}
      >
        <SendSheetContent
          onClose={() => setActiveSheet(null)}
          isDemoMode={isDemoMode}
        />
      </BottomSheet>

      {/* Sheet 2: Receive */}
      <BottomSheet
        open={activeSheet === 'receive'}
        onClose={() => setActiveSheet(null)}
        onClosed={handleSheetClosed}
        title={t.sheets.receive.title}
        triggerRef={receiveButtonRef}
      >
        <ReceiveSheetContent
          profile={profile}
          isDemoMode={isDemoMode}
          onClose={() => setActiveSheet(null)}
        />
      </BottomSheet>

      {/* Sheet 3: Get test USDC */}
      <BottomSheet
        open={activeSheet === 'faucet'}
        onClose={() => setActiveSheet(null)}
        onClosed={handleSheetClosed}
        title={t.sheets.faucet.title}
        triggerRef={faucetButtonRef}
      >
        <FaucetSheetContent
          walletAddress={profile.wallet_address}
          isDemoMode={isDemoMode}
          onClose={() => setActiveSheet(null)}
        />
      </BottomSheet>
    </div>
  );
}

