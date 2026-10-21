import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Eye,
  EyeOff,
  Send,
  ArrowDownLeft,
  Droplet,
} from 'lucide-react';
import { getBaseSepoliaBalance, getBaseSepoliaUsdcBalance } from '../../lib/viemClient';
import { UsdcTokenIcon, EthTokenIcon } from '../ui/PukicoBrand';
import { ActivityRow, type ActivityItem } from '../ui/ActivityRow';
import { BottomSheet } from '../ui/BottomSheet';
import {
  SendSheetContent,
  ReceiveSheetContent,
  FaucetSheetContent,
} from './sheets/QuickActionSheets';
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
    timestamp: '31m ago',
    network: 'Base Sepolia',
    amount: '0.01',
    currency: 'ETH',
    status: 'Confirmed',
  },
  {
    id: 'demo-2',
    type: 'incoming',
    targetId: 'rina',
    timestamp: '51m ago',
    network: 'Base Sepolia',
    amount: '0.02',
    currency: 'ETH',
    status: 'Confirmed',
  },
];

export function HomeView({
  profile,
  isDemoMode,
  onNavigateToHistory,
  onSheetOpenChange,
}: HomeViewProps) {
  // Balance visibility state saved in localStorage
  const [isBalanceHidden, setIsBalanceHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pukico_balance_hidden') === 'true';
    } catch {
      return false;
    }
  });

  // Active Bottom Sheet ('send' | 'receive' | 'faucet' | null)
  const [activeSheet, setActiveSheet] = useState<'send' | 'receive' | 'faucet' | null>(null);

  // References to action buttons for accessibility focus return
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const receiveButtonRef = useRef<HTMLButtonElement>(null);
  const faucetButtonRef = useRef<HTMLButtonElement>(null);

  // Notify parent of sheet open/close state to hide bottom navbar
  useEffect(() => {
    onSheetOpenChange?.(Boolean(activeSheet));
  }, [activeSheet, onSheetOpenChange]);

  // USDC state
  const [usdcBalance, setUsdcBalance] = useState<string | null>(isDemoMode ? '125.50' : null);
  const [isUsdcLoading, setIsUsdcLoading] = useState<boolean>(!isDemoMode);
  const [usdcError, setUsdcError] = useState<string | null>(null);

  // ETH state
  const [ethBalance, setEthBalance] = useState<string | null>(isDemoMode ? '0.05' : null);
  const [isEthLoading, setIsEthLoading] = useState<boolean>(!isDemoMode);
  const [ethError, setEthError] = useState<string | null>(null);

  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

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

  const fetchUsdcBalance = useCallback(async () => {
    if (isDemoMode) {
      setUsdcBalance('125.50');
      setIsUsdcLoading(false);
      setUsdcError(null);
      return;
    }

    if (!profile.wallet_address) {
      setUsdcError('No wallet address');
      setIsUsdcLoading(false);
      return;
    }

    setIsUsdcLoading(true);
    setUsdcError(null);
    try {
      const bal = await getBaseSepoliaUsdcBalance(profile.wallet_address);
      setUsdcBalance(bal);
    } catch {
      setUsdcError("Couldn't load balance");
    } finally {
      setIsUsdcLoading(false);
    }
  }, [profile.wallet_address, isDemoMode]);

  const fetchEthBalance = useCallback(async () => {
    if (isDemoMode) {
      setEthBalance('0.05');
      setIsEthLoading(false);
      setEthError(null);
      return;
    }

    if (!profile.wallet_address) {
      setEthError('No wallet address');
      setIsEthLoading(false);
      return;
    }

    setIsEthLoading(true);
    setEthError(null);
    try {
      const bal = await getBaseSepoliaBalance(profile.wallet_address);
      setEthBalance(bal);
    } catch {
      setEthError("Couldn't load balance");
    } finally {
      setIsEthLoading(false);
    }
  }, [profile.wallet_address, isDemoMode]);

  const fetchAllBalances = useCallback(async () => {
    setIsRefreshingAll(true);
    try {
      await Promise.all([fetchUsdcBalance(), fetchEthBalance()]);
    } finally {
      setIsRefreshingAll(false);
    }
  }, [fetchUsdcBalance, fetchEthBalance]);

  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  return (
    <div className="w-full max-w-[560px] mx-auto px-4 py-1 space-y-6">
      {/* 1. KARTU SALDO (Tinggi sekitar 150px, padding 20px, radius 24px, #0052FF solid, satu-satunya gaya card yang diizinkan) */}
      <section
        aria-label="Balance Summary"
        className="relative bg-[#0052FF] rounded-[24px] p-5 text-white overflow-hidden min-h-[150px] flex flex-col justify-between animate-fade-up"
      >
        {/* Watermark: pukico-logo-white.png 120px, opasitas 0.08 di kanan bawah terpotong sebagian */}
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

        {/* Baris Atas: Logo 22px plus teks Pukico 16px semibold (tanpa kotak putih), dan tombol mata 32px */}
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
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer active:scale-[0.98]"
            aria-label={isBalanceHidden ? 'Show balance' : 'Hide balance'}
          >
            {isBalanceHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Tengah: Saldo 30px bold (satuan "USDC" 16px, opasitas 80%) */}
        <div className="relative z-10 my-auto py-1">
          {isUsdcLoading ? (
            <div className="h-8 w-40 bg-white/20 rounded-lg animate-pulse" />
          ) : usdcError ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white/90">Couldn&apos;t load balance</span>
              <button
                type="button"
                onClick={fetchUsdcBalance}
                className="px-2 py-0.5 text-xs font-semibold rounded-md bg-white text-[#0052FF] hover:bg-[#EEF4FF] transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-[30px] font-bold tracking-tight text-white font-mono tabular-nums leading-tight">
                {isBalanceHidden ? '••••' : usdcBalance ?? '0.00'}
              </span>
              <span className="text-base font-semibold text-white/80">USDC</span>
            </div>
          )}
        </div>

        {/* Bawah: Chip "Testnet · Base Sepolia" tinggi 28px, teks 12px, dan teks "No monetary value" warna #DCE8FF (tanpa garis pemisah horizontal) */}
        <div className="relative z-10 flex items-center justify-between gap-2 pt-1 text-xs">
          <div className="h-7 px-2.5 rounded-full border border-white/30 text-xs font-medium text-white flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            <span>Testnet · Base Sepolia</span>
          </div>

          <span className="text-[#DCE8FF] text-xs font-medium">No monetary value</span>
        </div>
      </section>

      {/* 2. AKSI CEPAT (Grid 3 kolom sama lebar, tile di tengah, 44x44 radius 14px, ikon 18px, label 13px weight 500 mt-1.5) */}
      <section aria-label="Quick Actions" className="animate-fade-up [animation-delay:60ms]">
        <div className="grid grid-cols-3 w-full">
          {/* Action 1: Send */}
          <div className="flex flex-col items-center">
            <button
              ref={sendButtonRef}
              type="button"
              onClick={() => setActiveSheet('send')}
              className="w-11 h-11 rounded-[14px] bg-white border border-[#E5E7EB] hover:bg-[#EEF4FF] hover:border-[#0052FF]/30 flex items-center justify-center transition-all cursor-pointer active:scale-[0.98]"
              aria-label="Send"
            >
              <Send className="w-[18px] h-[18px] text-[#0A0B0D]" />
            </button>
            <span className="text-[13px] font-medium text-[#0A0B0D] mt-1.5 whitespace-nowrap text-center">
              Send
            </span>
          </div>

          {/* Action 2: Receive */}
          <div className="flex flex-col items-center">
            <button
              ref={receiveButtonRef}
              type="button"
              onClick={() => setActiveSheet('receive')}
              className="w-11 h-11 rounded-[14px] bg-white border border-[#E5E7EB] hover:bg-[#EEF4FF] hover:border-[#0052FF]/30 flex items-center justify-center transition-all cursor-pointer active:scale-[0.98]"
              aria-label="Receive"
            >
              <ArrowDownLeft className="w-[18px] h-[18px] text-[#0A0B0D]" />
            </button>
            <span className="text-[13px] font-medium text-[#0A0B0D] mt-1.5 whitespace-nowrap text-center">
              Receive
            </span>
          </div>

          {/* Action 3: Get test USDC */}
          <div className="flex flex-col items-center">
            <button
              ref={faucetButtonRef}
              type="button"
              onClick={() => setActiveSheet('faucet')}
              className="w-11 h-11 rounded-[14px] bg-white border border-[#E5E7EB] hover:bg-[#EEF4FF] hover:border-[#0052FF]/30 flex items-center justify-center transition-all cursor-pointer active:scale-[0.98]"
              aria-label="Get test USDC"
            >
              <Droplet className="w-[18px] h-[18px] text-[#0052FF]" />
            </button>
            <span className="text-[13px] font-medium text-[#0A0B0D] mt-1.5 whitespace-nowrap text-center">
              Get test USDC
            </span>
          </div>
        </div>
      </section>

      {/* 3. DAFTAR ASET (Datar langsung di latar #F7F8FA dengan border-b #E5E7EB, lencana 44px) */}
      <section aria-label="Asset List" className="animate-fade-up [animation-delay:120ms]">
        <div className="mb-2">
          <h2 className="text-[18px] font-bold text-[#0A0B0D] leading-tight">Asset List</h2>
          <p className="text-xs text-[#5B6577] mt-0.5">Assets on Base Sepolia</p>
        </div>

        <div className="divide-y divide-[#E5E7EB] border-b border-[#E5E7EB]">
          {/* Row 1: USDC */}
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              {/* Lencana token 44px */}
              <div className="w-11 h-11 rounded-[14px] bg-[#EEF4FF] flex items-center justify-center shrink-0">
                <UsdcTokenIcon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[15px] text-[#0A0B0D]">USD Coin</div>
                <div className="text-xs text-[#5B6577] mt-0.5">
                  USDC · <span className="text-[#0052FF] font-medium">Base Sepolia</span>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              {isUsdcLoading ? (
                <div className="h-5 w-16 bg-slate-100 rounded animate-pulse" />
              ) : usdcError ? (
                <button
                  type="button"
                  onClick={fetchUsdcBalance}
                  className="text-xs text-[#B91C1C] hover:underline"
                >
                  Retry
                </button>
              ) : (
                <>
                  <div className="font-mono text-[15px] font-bold text-[#0A0B0D] tabular-nums">
                    {isBalanceHidden ? '••••' : `${usdcBalance ?? '0.00'} USDC`}
                  </div>
                  <div className="text-[11px] text-[#5B6577] mt-0.5">Testnet</div>
                </>
              )}
            </div>
          </div>

          {/* Row 2: ETH */}
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              {/* Lencana token 44px */}
              <div className="w-11 h-11 rounded-[14px] bg-[#EEF4FF] flex items-center justify-center shrink-0">
                <EthTokenIcon className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[15px] text-[#0A0B0D]">Ether</div>
                <div className="text-xs text-[#5B6577] mt-0.5">
                  ETH · <span className="text-[#0052FF] font-medium">Base Sepolia</span>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              {isEthLoading ? (
                <div className="h-5 w-16 bg-slate-100 rounded animate-pulse" />
              ) : ethError ? (
                <button
                  type="button"
                  onClick={fetchEthBalance}
                  className="text-xs text-[#B91C1C] hover:underline"
                >
                  Retry
                </button>
              ) : (
                <>
                  <div className="font-mono text-[15px] font-bold text-[#0A0B0D] tabular-nums">
                    {isBalanceHidden ? '••••' : `${ethBalance ?? '0.0000'} ETH`}
                  </div>
                  <div className="text-[11px] text-[#5B6577] mt-0.5">Testnet</div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. AKTIVITAS TERBARU (Datar langsung di latar #F7F8FA, border-b #E5E7EB, kotak ikon 40px) */}
      <section aria-label="Recent Activity" className="animate-fade-up [animation-delay:180ms]">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[18px] font-bold text-[#0A0B0D]">Recent activity</h2>
          <button
            type="button"
            onClick={onNavigateToHistory}
            className="text-xs font-semibold text-[#0052FF] hover:text-[#0042D6] flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>Full history</span>
            <span aria-hidden="true">&rsaquo;</span>
          </button>
        </div>

        {/* Real mode: honest empty state (flat on background, border-b #E5E7EB) */}
        {!isDemoMode ? (
          <div className="py-7 border-b border-[#E5E7EB] text-center">
            <p className="text-xs sm:text-sm text-[#5B6577] max-w-xs mx-auto leading-relaxed">
              No activity yet. Transactions you send or receive will show up here.
            </p>
          </div>
        ) : (
          /* Demo Mode: 2 sample rows using ActivityRow with DEMO DATA indicator */
          <div>
            <div className="flex items-center justify-between py-1 text-[11px] text-[#B45309]">
              <span className="font-semibold uppercase tracking-wider">Preview Feed</span>
              <span className="px-1.5 py-0.5 rounded bg-[#FFFBEB] font-bold border border-[#FDE68A]">
                DEMO DATA
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
        title="Send"
        triggerRef={sendButtonRef}
      >
        <SendSheetContent onClose={() => setActiveSheet(null)} />
      </BottomSheet>

      {/* Sheet 2: Receive */}
      <BottomSheet
        open={activeSheet === 'receive'}
        onClose={() => setActiveSheet(null)}
        title="Receive"
        triggerRef={receiveButtonRef}
      >
        <ReceiveSheetContent profile={profile} isDemoMode={isDemoMode} />
      </BottomSheet>

      {/* Sheet 3: Get test USDC */}
      <BottomSheet
        open={activeSheet === 'faucet'}
        onClose={() => setActiveSheet(null)}
        title="Get test USDC"
        triggerRef={faucetButtonRef}
      >
        <FaucetSheetContent
          walletAddress={profile.wallet_address}
          onRefreshBalance={fetchAllBalances}
          isRefreshing={isRefreshingAll}
          isDemoMode={isDemoMode}
        />
      </BottomSheet>
    </div>
  );
}
