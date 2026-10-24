import React, { useState, useRef } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useTx } from '../../context/TxContext';
import { ActivityRow } from '../ui/ActivityRow';
import { TxDetailsSheet } from '../ui/TxDetailsSheet';
import { useT } from '../../i18n';
import type { TxRecord } from '../../lib/txApi';

interface HistoryViewProps {
  isDemoMode: boolean;
}

export function HistoryView({ isDemoMode }: HistoryViewProps) {
  const { t } = useT();
  const { txs, status, refresh } = useTx();

  const [selectedTx, setSelectedTx] = useState<TxRecord | null>(null);

  // --- Pull to Refresh (touch only, flat) ---
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState<boolean>(false);
  const [isPullReturning, setIsPullReturning] = useState<boolean>(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  const touchStartYRef = useRef<number | null>(null);
  const isTrackingTouchRef = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (selectedTx !== null || isPullRefreshing) return;
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
      setPullDistance(48);
      setIsPullRefreshing(true);
      setLiveAnnouncement(t.home.refreshing);

      const startTime = Date.now();
      try {
        await refresh();
      } finally {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 600 - elapsed);
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
      setIsPullReturning(true);
      setPullDistance(0);
      setTimeout(() => {
        setIsPullReturning(false);
      }, 200);
    }
  };

  const isLoadingFirstTime = status === 'loading' && txs.length === 0;
  const isError = status === 'error' && txs.length === 0;
  const isEmpty = !isLoadingFirstTime && !isError && txs.length === 0;

  return (
    <div
      className="relative w-full max-w-[560px] lg:max-w-[720px] mx-auto px-4 py-2 space-y-4 touch-pan-y"
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

      {/* Header */}
      <div className="pt-1">
        <h1 className="text-2xl font-bold text-[#0A0B0D] tracking-tight">{t.history.title}</h1>
        <p className="text-xs text-[#5B6577] mt-0.5">{t.history.subtitle}</p>
      </div>

      {/* Demo Notice */}
      {isDemoMode && (
        <div className="flex items-center justify-between py-1 text-[11px] text-[#B45309]">
          <span className="text-[13px] font-semibold text-[#5B6577]">{t.history.previewFeed}</span>
          <span className="px-1.5 py-0.5 rounded bg-[#FFFBEB] font-bold border border-[#FDE68A]">
            {t.common.demoData}
          </span>
        </div>
      )}

      {/* Main Content Area */}
      {isLoadingFirstTime ? (
        /* 1. Skeleton Loading State */
        <div className="divide-y divide-[#E5E7EB] border-b border-[#E5E7EB]" aria-label="Loading history">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between py-3.5 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[14px] bg-[#E5E7EB]" />
                <div className="space-y-1.5">
                  <div className="w-24 h-4 bg-[#E5E7EB] rounded" />
                  <div className="w-32 h-3 bg-[#E5E7EB] rounded" />
                </div>
              </div>
              <div className="space-y-1.5 text-right">
                <div className="w-16 h-4 bg-[#E5E7EB] rounded ml-auto" />
                <div className="w-12 h-3 bg-[#E5E7EB] rounded ml-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        /* 2. Error State */
        <div className="py-12 text-center select-none">
          <div className="w-10 h-10 rounded-full bg-[#FEF2F2] flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="w-5 h-5 text-[#B91C1C]" />
          </div>
          <p className="text-sm font-semibold text-[#0A0B0D] mb-1">{t.history.couldNotLoad}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-3 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0052FF] text-white hover:bg-[#0042D6] active:scale-[0.97] transition-all cursor-pointer"
          >
            {t.common.retry}
          </button>
        </div>
      ) : isEmpty ? (
        /* 3. Empty State */
        <div className="py-12 border-b border-[#E5E7EB] text-center select-none">
          <p className="text-sm text-[#5B6577] max-w-xs mx-auto leading-relaxed">
            {t.history.noActivity}
          </p>
        </div>
      ) : (
        /* 4. Transactions List */
        <div className="divide-y divide-[#E5E7EB] border-b border-[#E5E7EB]">
          {txs.map((tx) => (
            <ActivityRow
              key={tx.tx_hash}
              activity={tx}
              onClick={() => setSelectedTx(tx)}
            />
          ))}
        </div>
      )}

      {/* Transaction Details Sheet */}
      <TxDetailsSheet
        open={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        tx={selectedTx}
      />
    </div>
  );
}
