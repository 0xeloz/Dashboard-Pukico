import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  Search,
  Calendar,
  X,
  SearchX,
  ChevronDown,
} from 'lucide-react';
import { useTx } from '../../context/TxContext';
import { ActivityRow } from '../ui/ActivityRow';
import { TxDetailsSheet } from '../ui/TxDetailsSheet';
import { BottomSheet } from '../ui/BottomSheet';
import { useT } from '../../i18n';
import type { TxRecord } from '../../lib/txApi';

interface HistoryViewProps {
  isDemoMode: boolean;
}

export type StatusFilter = 'all' | 'in' | 'out' | 'pending' | 'failed';
export type AssetFilter = 'all' | 'USDC' | 'ETH';
export type DatePreset = 'last7' | 'last30' | 'thisMonth' | '';

interface FilterState {
  status: StatusFilter;
  asset: AssetFilter;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  datePreset: DatePreset;
  search: string;
}

const STORAGE_KEY = 'pukico.history_filters';
const PAGE_SIZE = 30;

const DEFAULT_FILTERS: FilterState = {
  status: 'all',
  asset: 'all',
  startDate: '',
  endDate: '',
  datePreset: '',
  search: '',
};

function loadStoredFilters(): FilterState {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw);
    return {
      status: parsed.status || 'all',
      asset: parsed.asset || 'all',
      startDate: parsed.startDate || '',
      endDate: parsed.endDate || '',
      datePreset: parsed.datePreset || '',
      search: parsed.search || '',
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveStoredFilters(filters: FilterState): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage quota errors
  }
}

// Convert YYYY-MM-DD to local start-of-day ms
function getStartOfDayMs(dateStr: string): number {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return 0;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return new Date(y, m, d, 0, 0, 0, 0).getTime();
}

// Convert YYYY-MM-DD to local end-of-day ms
function getEndOfDayMs(dateStr: string): number {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return 0;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return new Date(y, m, d, 23, 59, 59, 999).getTime();
}

// Format local Date into 'YYYY-MM-DD'
function formatToYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Parse string amount into BigInt units without float precision loss
function parseUnitsSafely(str: string | undefined | null, decimals: number): bigint {
  if (!str) return 0n;
  const clean = str.replace(/,/g, '').trim();
  if (!clean || clean === '0') return 0n;
  try {
    const isNegative = clean.startsWith('-');
    const val = isNegative ? clean.slice(1) : clean;
    const parts = val.split('.');
    const intPart = parts[0] || '0';
    let fracPart = (parts[1] || '').slice(0, decimals);
    fracPart = fracPart.padEnd(decimals, '0');
    const units = BigInt(intPart) * (10n ** BigInt(decimals)) + BigInt(fracPart);
    return isNegative ? -units : units;
  } catch {
    return 0n;
  }
}

// Convert BigInt units back to standard decimal string
function formatUnitsBigInt(units: bigint, decimals: number): string {
  const isNegative = units < 0n;
  const abs = isNegative ? -units : units;
  const divisor = 10n ** BigInt(decimals);
  const intPart = abs / divisor;
  const fracPart = (abs % divisor).toString().padStart(decimals, '0');
  const res = `${intPart}.${fracPart}`;
  return isNegative ? `-${res}` : res;
}

export function HistoryView({ isDemoMode }: HistoryViewProps) {
  const { t, lang, fmt } = useT();
  const { txs, status, refresh } = useTx();

  const [selectedTx, setSelectedTx] = useState<TxRecord | null>(null);

  // Filters state with sessionStorage persistence
  const [filters, setFilters] = useState<FilterState>(() => loadStoredFilters());
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);

  // Pagination state (incremental 30 per step)
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);

  // Temporary date input states for the BottomSheet modal
  const [tempStartDate, setTempStartDate] = useState<string>(filters.startDate);
  const [tempEndDate, setTempEndDate] = useState<string>(filters.endDate);
  const [tempDatePreset, setTempDatePreset] = useState<DatePreset>(filters.datePreset);

  // Update sessionStorage whenever filters change
  const updateFilters = useCallback((updater: (prev: FilterState) => FilterState) => {
    setFilters((prev) => {
      const next = updater(prev);
      saveStoredFilters(next);
      return next;
    });
    setVisibleCount(PAGE_SIZE); // Reset pagination on filter change
  }, []);

  const handleResetAllFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    saveStoredFilters(DEFAULT_FILTERS);
    setVisibleCount(PAGE_SIZE);
  }, []);

  // --- Pull to Refresh (touch only, flat) ---
  const [pullDistance, setPullDistance] = useState<number>(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState<boolean>(false);
  const [isPullReturning, setIsPullReturning] = useState<boolean>(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  const touchStartYRef = useRef<number | null>(null);
  const isTrackingTouchRef = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (selectedTx !== null || isPullRefreshing || isDateSheetOpen) return;
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

  // --- Filtering Logic (combined with AND) ---
  const filteredTxs = useMemo(() => {
    return txs.filter((tx) => {
      // 1. Status / Direction Filter
      if (filters.status !== 'all') {
        const rawStatus = (tx.status || 'confirmed').toLowerCase();
        const isIncoming = tx.direction === 'in' || tx.direction === 'incoming';
        const isOutgoing = !isIncoming;

        if (filters.status === 'in' && !isIncoming) return false;
        if (filters.status === 'out' && !isOutgoing) return false;
        if (filters.status === 'pending' && rawStatus !== 'pending') return false;
        if (filters.status === 'failed' && rawStatus !== 'failed') return false;
      }

      // 2. Asset Filter
      if (filters.asset !== 'all') {
        if (tx.asset !== filters.asset) return false;
      }

      // 3. Username Search (matches counterparty, to_pukico_id, from_pukico_id, case-insensitive, ignores @)
      if (filters.search.trim()) {
        const query = filters.search.trim().toLowerCase().replace(/^@/, '');
        const cp = (tx.counterparty || tx.to_pukico_id || tx.from_pukico_id || '')
          .toLowerCase()
          .replace(/^@/, '');
        if (!cp.includes(query)) return false;
      }

      // 4. Date Range Filter (inclusive)
      if (filters.startDate || filters.endDate) {
        if (!tx.created_at) return false;
        const txMs = new Date(tx.created_at).getTime();
        if (isNaN(txMs)) return false;

        if (filters.startDate) {
          const startMs = getStartOfDayMs(filters.startDate);
          if (txMs < startMs) return false;
        }

        if (filters.endDate) {
          const endMs = getEndOfDayMs(filters.endDate);
          if (txMs > endMs) return false;
        }
      }

      return true;
    });
  }, [txs, filters]);

  // Paginated visible list
  const visibleTxs = useMemo(() => {
    return filteredTxs.slice(0, visibleCount);
  }, [filteredTxs, visibleCount]);

  // --- Summary Calculation (confirmed txs only, using BigInt string math) ---
  const summary = useMemo(() => {
    let inUsdcUnits = 0n;
    let outUsdcUnits = 0n;
    let inEthUnits = 0n;
    let outEthUnits = 0n;

    for (const tx of filteredTxs) {
      const rawStatus = (tx.status || 'confirmed').toLowerCase();
      // Hanya hitung transaksi berstatus confirmed
      if (rawStatus !== 'confirmed') continue;

      const isIncoming = tx.direction === 'in' || tx.direction === 'incoming';
      if (isIncoming) {
        if (tx.asset === 'USDC') {
          inUsdcUnits += parseUnitsSafely(tx.amount, 6);
        } else if (tx.asset === 'ETH') {
          inEthUnits += parseUnitsSafely(tx.amount, 18);
        }
      } else {
        if (tx.asset === 'USDC') {
          outUsdcUnits += parseUnitsSafely(tx.amount, 6);
        } else if (tx.asset === 'ETH') {
          outEthUnits += parseUnitsSafely(tx.amount, 18);
        }
      }
    }

    return {
      inUsdcStr: formatUnitsBigInt(inUsdcUnits, 6),
      outUsdcStr: formatUnitsBigInt(outUsdcUnits, 6),
      inEthStr: formatUnitsBigInt(inEthUnits, 18),
      outEthStr: formatUnitsBigInt(outEthUnits, 18),
      hasIncoming: inUsdcUnits > 0n || inEthUnits > 0n,
      hasOutgoing: outUsdcUnits > 0n || outEthUnits > 0n,
    };
  }, [filteredTxs]);

  // --- Date Grouping (Device local timezone, newest first) ---
  const groupedTxs = useMemo(() => {
    const now = new Date();
    const groups: { key: string; label: string; txs: TxRecord[] }[] = [];
    let currentGroup: { key: string; label: string; txs: TxRecord[] } | null = null;

    const formatter = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    for (const tx of visibleTxs) {
      const d = tx.created_at ? new Date(tx.created_at) : new Date();

      const isToday =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();

      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const isYesterday =
        d.getFullYear() === yesterday.getFullYear() &&
        d.getMonth() === yesterday.getMonth() &&
        d.getDate() === yesterday.getDate();

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;

      let label = '';
      if (isToday) {
        label = t.history.today;
      } else if (isYesterday) {
        label = t.history.yesterday;
      } else {
        label = formatter.format(d);
      }

      if (!currentGroup || currentGroup.key !== key) {
        currentGroup = { key, label, txs: [tx] };
        groups.push(currentGroup);
      } else {
        currentGroup.txs.push(tx);
      }
    }

    return groups;
  }, [visibleTxs, lang, t.history.today, t.history.yesterday]);

  // Handle open date filter sheet
  const handleOpenDateSheet = () => {
    setTempStartDate(filters.startDate);
    setTempEndDate(filters.endDate);
    setTempDatePreset(filters.datePreset);
    setIsDateSheetOpen(true);
  };

  // Handle preset selection inside Date Sheet
  const handleSelectDatePreset = (preset: 'last7' | 'last30' | 'thisMonth') => {
    const now = new Date();
    const todayStr = formatToYMD(now);
    let startStr = '';

    if (preset === 'last7') {
      const past = new Date(now.getTime() - 7 * 86400000);
      startStr = formatToYMD(past);
    } else if (preset === 'last30') {
      const past = new Date(now.getTime() - 30 * 86400000);
      startStr = formatToYMD(past);
    } else if (preset === 'thisMonth') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startStr = formatToYMD(firstOfMonth);
    }

    setTempStartDate(startStr);
    setTempEndDate(todayStr);
    setTempDatePreset(preset);
  };

  // Apply date filters from sheet
  const handleApplyDateFilter = () => {
    updateFilters((prev) => ({
      ...prev,
      startDate: tempStartDate,
      endDate: tempEndDate,
      datePreset: tempDatePreset,
    }));
    setIsDateSheetOpen(false);
  };

  // Reset date filter
  const handleResetDateFilter = () => {
    setTempStartDate('');
    setTempEndDate('');
    setTempDatePreset('');
    updateFilters((prev) => ({
      ...prev,
      startDate: '',
      endDate: '',
      datePreset: '',
    }));
    setIsDateSheetOpen(false);
  };

  // Format active date filter chip label
  const activeDateLabel = useMemo(() => {
    if (!filters.startDate && !filters.endDate) return null;
    if (filters.datePreset === 'last7') return t.history.last7Days;
    if (filters.datePreset === 'last30') return t.history.last30Days;
    if (filters.datePreset === 'thisMonth') return t.history.thisMonth;

    if (filters.startDate && filters.endDate) {
      const s = new Date(getStartOfDayMs(filters.startDate));
      const e = new Date(getStartOfDayMs(filters.endDate));
      const df = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
        day: 'numeric',
        month: 'short',
      });
      return `${df.format(s)} – ${df.format(e)}`;
    }
    if (filters.startDate) {
      const s = new Date(getStartOfDayMs(filters.startDate));
      return `≥ ${new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' }).format(s)}`;
    }
    if (filters.endDate) {
      const e = new Date(getStartOfDayMs(filters.endDate));
      return `≤ ${new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' }).format(e)}`;
    }
    return null;
  }, [filters.startDate, filters.endDate, filters.datePreset, lang, t.history]);

  const hasAnyFilterActive =
    filters.status !== 'all' ||
    filters.asset !== 'all' ||
    Boolean(filters.search.trim()) ||
    Boolean(filters.startDate || filters.endDate);

  const isLoadingFirstTime = status === 'loading' && txs.length === 0;
  const isError = status === 'error' && txs.length === 0;
  const isEntirelyEmpty = !isLoadingFirstTime && !isError && txs.length === 0;

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
      <div className="pt-1 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#0A0B0D] tracking-tight">{t.history.title}</h1>
          <p className="text-xs text-[#5B6577] mt-0.5">{t.history.subtitle}</p>
        </div>

        {/* Demo Notice */}
        {isDemoMode && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#FFFBEB] text-[#B45309] text-[11px] font-bold border border-[#FDE68A]">
            {t.common.demoData}
          </span>
        )}
      </div>

      {/* ================= CONTROLS & FILTERS ================= */}
      <div className="space-y-2.5">
        {/* 1. Username Search Box */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#5B6577] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilters((prev) => ({ ...prev, search: e.target.value }))}
            placeholder={t.history.searchPlaceholder}
            className="w-full pl-9 pr-9 py-2 text-xs rounded-xl bg-white border border-[#E5E7EB] text-[#0A0B0D] placeholder:text-[#5B6577]/70 focus:outline-none focus:border-[#0052FF] shadow-2xs transition-colors"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => updateFilters((prev) => ({ ...prev, search: '' }))}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#5B6577] hover:text-[#0A0B0D] cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 2. Scrollable Chips Row: Status + Asset + Date Button */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
          {/* Status Chips */}
          {(
            [
              { key: 'all', label: t.history.filterAll },
              { key: 'in', label: t.history.filterIn },
              { key: 'out', label: t.history.filterOut },
              { key: 'pending', label: t.history.filterPending },
              { key: 'failed', label: t.history.filterFailed },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => updateFilters((prev) => ({ ...prev, status: item.key }))}
              className={`shrink-0 px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                filters.status === item.key
                  ? 'bg-[#0052FF] text-white shadow-xs font-semibold'
                  : 'bg-white text-[#5B6577] border border-[#E5E7EB] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              {item.label}
            </button>
          ))}

          <span className="w-[1px] h-4 bg-[#E5E7EB] shrink-0 mx-0.5" />

          {/* Asset Chips */}
          {(
            [
              { key: 'all', label: t.history.allAssets },
              { key: 'USDC', label: 'USDC' },
              { key: 'ETH', label: 'ETH' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => updateFilters((prev) => ({ ...prev, asset: item.key }))}
              className={`shrink-0 px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer ${
                filters.asset === item.key
                  ? 'bg-[#0052FF] text-white shadow-xs font-semibold'
                  : 'bg-white text-[#5B6577] border border-[#E5E7EB] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              {item.label}
            </button>
          ))}

          <span className="w-[1px] h-4 bg-[#E5E7EB] shrink-0 mx-0.5" />

          {/* Date Range Picker Trigger */}
          <button
            type="button"
            onClick={handleOpenDateSheet}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium border transition-all cursor-pointer ${
              filters.startDate || filters.endDate
                ? 'bg-[#EEF4FF] text-[#0052FF] border-[#BFDBFE] font-semibold'
                : 'bg-white text-[#5B6577] border-[#E5E7EB] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{t.history.dateFilter}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </div>

        {/* 3. Active Date Filter Badge (removable) */}
        {activeDateLabel && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EEF4FF] text-[#0052FF] text-xs font-medium border border-[#BFDBFE]">
              <Calendar className="w-3 h-3" />
              <span>{activeDateLabel}</span>
              <button
                type="button"
                onClick={handleResetDateFilter}
                className="ml-0.5 p-0.5 hover:bg-[#DBEAFE] rounded cursor-pointer"
                aria-label={t.history.clearDateFilter}
              >
                <X className="w-3 h-3" />
              </button>
            </span>

            {hasAnyFilterActive && (
              <button
                type="button"
                onClick={handleResetAllFilters}
                className="text-[11px] text-[#5B6577] hover:text-[#0052FF] underline ml-2 cursor-pointer"
              >
                {t.history.resetFilters}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ================= 4. SUMMARY ROW (Confirmed only, BigInt decimal math) ================= */}
      {filteredTxs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-[#E5E7EB] text-xs shadow-2xs">
          <div className="font-medium text-[#5B6577]">
            <span className="font-bold text-[#0A0B0D] tabular-nums">{filteredTxs.length}</span>{' '}
            {t.history.summaryTotal.replace('{count}', '').trim()}
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums">
            {summary.hasIncoming && (
              <div className="flex items-center gap-1 text-[#047857]">
                <span className="font-sans text-[11px] text-[#5B6577]">{t.history.summaryIn}:</span>
                {summary.inUsdcStr !== '0.000000' && (
                  <span>+{fmt.usdcString(summary.inUsdcStr)} USDC</span>
                )}
                {summary.inUsdcStr !== '0.000000' && summary.inEthStr !== '0.000000000000000000' && (
                  <span className="text-[#E5E7EB]">·</span>
                )}
                {summary.inEthStr !== '0.000000000000000000' && (
                  <span>+{fmt.ethBalance(summary.inEthStr)} ETH</span>
                )}
              </div>
            )}

            {summary.hasOutgoing && (
              <div className="flex items-center gap-1 text-[#0A0B0D]">
                <span className="font-sans text-[11px] text-[#5B6577]">{t.history.summaryOut}:</span>
                {summary.outUsdcStr !== '0.000000' && (
                  <span>-{fmt.usdcString(summary.outUsdcStr)} USDC</span>
                )}
                {summary.outUsdcStr !== '0.000000' && summary.outEthStr !== '0.000000000000000000' && (
                  <span className="text-[#E5E7EB]">·</span>
                )}
                {summary.outEthStr !== '0.000000000000000000' && (
                  <span>-{fmt.ethBalance(summary.outEthStr)} ETH</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= 5. MAIN CONTENT AREA ================= */}
      {isLoadingFirstTime ? (
        /* Skeleton Loading */
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
        /* Error State */
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
      ) : isEntirelyEmpty ? (
        /* Empty State (no transactions at all) */
        <div className="py-12 border-b border-[#E5E7EB] text-center select-none">
          <p className="text-sm text-[#5B6577] max-w-xs mx-auto leading-relaxed">
            {t.history.noActivity}
          </p>
        </div>
      ) : filteredTxs.length === 0 ? (
        /* Friendly Empty State for Filters */
        <div className="py-12 border-b border-[#E5E7EB] text-center select-none space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#F3F4F6] flex items-center justify-center mx-auto">
            <SearchX className="w-5 h-5 text-[#5B6577]" />
          </div>
          <p className="text-sm font-medium text-[#5B6577] max-w-xs mx-auto">
            {t.history.noFilteredResults}
          </p>
          <button
            type="button"
            onClick={handleResetAllFilters}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0052FF] text-white hover:bg-[#0042D6] active:scale-[0.97] transition-all cursor-pointer shadow-xs"
          >
            {t.history.resetFilters}
          </button>
        </div>
      ) : (
        /* Grouped Transactions List by Date (Sticky header) */
        <div className="space-y-4">
          {groupedTxs.map((group) => (
            <div key={group.key} className="space-y-0">
              {/* Sticky Date Group Header */}
              <div className="sticky top-0 z-10 bg-[#F7F8FA] py-2 px-1 flex items-center justify-between border-b border-[#E5E7EB]">
                <span className="text-xs font-semibold text-[#0A0B0D] tracking-tight">
                  {group.label}
                </span>
                <span className="text-[11px] font-bold text-[#5B6577] px-2 py-0.5 rounded-full bg-[#E5E7EB]/70 tabular-nums">
                  {group.txs.length}
                </span>
              </div>

              {/* Transactions in this group */}
              <div className="divide-y divide-[#E5E7EB] border-b border-[#E5E7EB]">
                {group.txs.map((tx) => (
                  <ActivityRow
                    key={tx.tx_hash}
                    activity={tx}
                    onClick={() => setSelectedTx(tx)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* ================= 6. PAGINATION / LOAD MORE ================= */}
          <div className="pt-3 pb-6 text-center space-y-2">
            <p className="text-xs text-[#5B6577]">
              {t.history.showingCount
                .replace('{shown}', String(Math.min(visibleCount, filteredTxs.length)))
                .replace('{total}', String(filteredTxs.length))}
            </p>

            {visibleCount < filteredTxs.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full py-2.5 px-4 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F3F4F6] text-[#0A0B0D] text-xs font-semibold active:scale-[0.98] transition-all cursor-pointer shadow-2xs"
              >
                {t.history.loadMore}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ================= 7. DATE FILTER BOTTOM SHEET ================= */}
      <BottomSheet
        open={isDateSheetOpen}
        onClose={() => setIsDateSheetOpen(false)}
        title={t.history.dateFilterTitle}
      >
        <div className="space-y-4 pt-1 pb-4 text-left select-none text-xs">
          {/* Quick Preset Buttons */}
          <div>
            <label className="block text-[11px] font-semibold text-[#5B6577] uppercase tracking-wider mb-2">
              Pilihan Cepat
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: 'last7', label: t.history.last7Days },
                  { key: 'last30', label: t.history.last30Days },
                  { key: 'thisMonth', label: t.history.thisMonth },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleSelectDatePreset(preset.key)}
                  className={`py-2 px-2 rounded-xl text-center font-medium border transition-colors cursor-pointer text-xs ${
                    tempDatePreset === preset.key
                      ? 'bg-[#EEF4FF] text-[#0052FF] border-[#BFDBFE] font-semibold'
                      : 'bg-white text-[#0A0B0D] border-[#E5E7EB] hover:bg-[#F9FAFB]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Native Date Inputs (Dari & Sampai) */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-[#5B6577] mb-1">
                {t.history.dateFrom}
              </label>
              <input
                type="date"
                value={tempStartDate}
                onChange={(e) => {
                  setTempStartDate(e.target.value);
                  setTempDatePreset('');
                }}
                className="w-full py-2 px-3 rounded-xl bg-white border border-[#E5E7EB] text-xs text-[#0A0B0D] focus:outline-none focus:border-[#0052FF]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5B6577] mb-1">
                {t.history.dateTo}
              </label>
              <input
                type="date"
                value={tempEndDate}
                onChange={(e) => {
                  setTempEndDate(e.target.value);
                  setTempDatePreset('');
                }}
                className="w-full py-2 px-3 rounded-xl bg-white border border-[#E5E7EB] text-xs text-[#0A0B0D] focus:outline-none focus:border-[#0052FF]"
              />
            </div>
          </div>

          {/* Action Buttons: Apply & Reset */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDateFilter}
              className="flex-1 py-2.5 px-4 rounded-xl border border-[#E5E7EB] bg-white text-[#5B6577] hover:text-[#0A0B0D] font-semibold text-xs active:scale-[0.98] transition-all cursor-pointer"
            >
              {t.history.reset}
            </button>
            <button
              type="button"
              onClick={handleApplyDateFilter}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#0052FF] text-white hover:bg-[#0042D6] font-semibold text-xs active:scale-[0.98] transition-all cursor-pointer shadow-xs"
            >
              {t.history.apply}
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Transaction Details Sheet */}
      <TxDetailsSheet
        open={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        tx={selectedTx}
      />
    </div>
  );
}
