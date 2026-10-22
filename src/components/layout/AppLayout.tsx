import React, { useState } from 'react';
import {
  LayoutGrid,
  Users,
  Compass,
  History,
  Settings,
  Bell,
  Copy,
  Check,
  Terminal,
  AlertTriangle,
} from 'lucide-react';
import { NotificationPanel } from '../ui/NotificationPanel';
import { GenericNetworkIcon } from '../ui/PukicoBrand';
import { useT } from '../../i18n';
import type { ActiveTab, UserProfile } from '../../types';

interface AppLayoutProps {
  currentTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  profile: UserProfile;
  isDemoMode: boolean;
  isSheetOpen?: boolean;
  children: React.ReactNode;
}

const TAB_INDEX_MAP: Record<ActiveTab, number> = {
  home: 0,
  receive: 0,
  friends: 1,
  discover: 2,
  history: 3,
  settings: 4,
  dev: 4,
};

export function AppLayout({
  currentTab,
  onTabChange,
  profile,
  isDemoMode,
  isSheetOpen = false,
  children,
}: AppLayoutProps) {
  const { t, phase } = useT();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Pukico ID validation: only a-z, 0-9, and _
  const sanitizedId = profile.pukico_id ? profile.pukico_id.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '') : '';
  const formattedPukicoId = sanitizedId ? `@${sanitizedId}` : '';

  const handleCopyId = async () => {
    if (!formattedPukicoId) return;
    try {
      await navigator.clipboard.writeText(formattedPukicoId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch {
      const input = document.createElement('input');
      input.value = formattedPukicoId;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    }
  };

  const isAdmin = profile.role === 'admin';
  const showDemoBanner = isDemoMode;
  const activeIndex = TAB_INDEX_MAP[currentTab] ?? 0;
  const isDiscover = currentTab === 'discover';

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col lg:flex-row text-[#3B4455]">
      {/* Notifications Drawer */}
      <NotificationPanel
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />

      {/* Desktop Sidebar (lg: viewports) */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-[#E5E7EB] shrink-0 sticky top-0 h-screen p-5 justify-between z-30">
        <div>
          {/* Brand Wordmark & Identity */}
          <div className="flex items-center gap-2.5 px-3 py-3 mb-6">
            <img
              src="/pukico-logo.png"
              alt="Pukico"
              className="w-[22px] h-[22px] object-contain"
            />
            <span className="font-semibold text-base text-[#0A0B0D] tracking-tight">
              Pukico
            </span>
            <span className="text-[11px] font-medium text-[#0052FF] bg-[#EEF4FF] px-1.5 py-0.5 rounded-full ml-auto">
              {t.common.testnet}
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="space-y-2" aria-label="Desktop Navigation">
            {/* 1. Home */}
            <button
              type="button"
              onClick={() => onTabChange('home')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] ${
                currentTab === 'home' || currentTab === 'receive'
                  ? 'bg-[#EEF4FF] text-[#0052FF] font-semibold'
                  : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              <LayoutGrid className="w-5 h-5 shrink-0" />
              <span>{t.nav.home}</span>
            </button>

            {/* 2. Friends */}
            <button
              type="button"
              onClick={() => onTabChange('friends')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] ${
                currentTab === 'friends'
                  ? 'bg-[#EEF4FF] text-[#0052FF] font-semibold'
                  : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              <Users className="w-5 h-5 shrink-0" />
              <span>{t.nav.friends}</span>
            </button>

            {/* 3. Discover */}
            <button
              type="button"
              onClick={() => onTabChange('discover')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] ${
                currentTab === 'discover'
                  ? 'bg-[#0052FF] text-white'
                  : 'bg-[#EEF4FF] text-[#0052FF] hover:bg-[#E0ECFF]'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <Compass className="w-5 h-5 shrink-0" />
                <span>{t.nav.discover}</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 font-semibold">
                {t.nav.hub}
              </span>
            </button>

            {/* 4. History */}
            <button
              type="button"
              onClick={() => onTabChange('history')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] ${
                currentTab === 'history'
                  ? 'bg-[#EEF4FF] text-[#0052FF] font-semibold'
                  : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              <History className="w-5 h-5 shrink-0" />
              <span>{t.nav.history}</span>
            </button>

            {/* 5. Settings */}
            <button
              type="button"
              onClick={() => onTabChange('settings')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] ${
                currentTab === 'settings'
                  ? 'bg-[#EEF4FF] text-[#0052FF] font-semibold'
                  : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              <Settings className="w-5 h-5 shrink-0" />
              <span>{t.nav.settings}</span>
            </button>

            {/* /dev for Admin (remains English) */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => onTabChange('dev')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] ${
                  currentTab === 'dev'
                    ? 'bg-[#0A0B0D] text-white font-semibold'
                    : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <Terminal className="w-5 h-5 shrink-0" />
                  <span>{t.nav.devConsole}</span>
                </div>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-[#B45309] font-semibold">
                  {t.common.admin}
                </span>
              </button>
            )}
          </nav>
        </div>

        {/* Desktop Profile Summary - Flat style with top border */}
        <div className="pt-4 border-t border-[#E5E7EB]">
          <div className="text-[11px] font-medium text-[#5B6577] mb-1">{t.nav.currentSession}</div>
          <div className="font-mono text-xs font-bold text-[#0A0B0D] truncate">
            {formattedPukicoId ? formattedPukicoId : t.common.noPukicoId}
          </div>
          <div className="font-mono text-[10px] text-[#5B6577] truncate mt-1">
            {profile.wallet_address.slice(0, 6)}...{profile.wallet_address.slice(-4)}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-[calc(88px+env(safe-area-inset-bottom,0px))] lg:pb-8">
        {/* Banner demo tipis */}
        {showDemoBanner && (
          <div
            role="status"
            className="w-full h-7 bg-[#FFFBEB] border-b border-[#FDE68A] px-4 text-[#92400E] text-xs font-medium flex items-center justify-center gap-1.5 shrink-0 select-none"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#B45309]" />
            <span className="font-bold tracking-tight">{t.common.demoBanner}</span>
          </div>
        )}

        {/* TOPBAR (sisi kanan tetap diam walau lebar pil Pukico ID di kiri berubah) */}
        <header className="w-full h-14 px-4 py-2 shrink-0">
          <div className="w-full max-w-[560px] mx-auto flex items-center justify-between gap-2 h-full">
            {/* Kiri: pil ID */}
            <div className="h-9 px-3 bg-white border border-[#E5E7EB] rounded-full flex items-center gap-2">
              {formattedPukicoId ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                  <span className="font-mono text-[13px] font-semibold text-[#0A0B0D] select-all">
                    {formattedPukicoId}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1 text-[#5B6577] hover:text-[#0A0B0D] rounded-full transition-transform duration-[var(--dur-tap)] active:scale-[0.97] cursor-pointer"
                    aria-label={copiedId ? t.common.copied : t.common.copyPukicoId}
                    title={copiedId ? t.common.copiedWithExclamation : t.common.copyPukicoId}
                  >
                    {copiedId ? (
                      <span className="inline-flex items-center text-[#047857] transition-opacity duration-150">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center transition-opacity duration-150">
                        <Copy className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                  {copiedId && (
                    <span className="text-[10px] font-semibold text-[#047857] transition-opacity duration-150">
                      {t.common.copied}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[13px] font-medium text-[#5B6577]">
                  {t.common.noPukicoId}
                </span>
              )}
            </div>

            {/* Kanan: pil jaringan lalu lonceng (shrink-0 untuk mencegah pergeseran) */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-9 px-2.5 bg-white border border-[#E5E7EB] rounded-full flex items-center gap-1.5">
                <GenericNetworkIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="px-1.5 py-0.5 rounded-full bg-[#EEF4FF] text-[#0052FF] text-[11px] font-semibold">
                  {t.common.testnet}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsNotificationOpen(true)}
                className="w-9 h-9 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#EEF4FF] transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
                aria-label={t.notifications.title}
              >
                <Bell className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Viewport Content dibungkus .lang-content[data-phase] */}
        <main className="flex-1 w-full pt-1">
          <div className="lang-content w-full" data-phase={phase}>
            {children}
          </div>
        </main>
      </div>

      {/* NAVBAR BAWAH */}
      <div
        className={`lg:hidden fixed bottom-3 left-0 right-0 z-40 px-3 pointer-events-none pb-safe transition-all duration-250 ease-out ${
          isSheetOpen || isNotificationOpen
            ? 'translate-y-[calc(100%+24px)] opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100'
        }`}
        aria-hidden={isSheetOpen || isNotificationOpen ? true : undefined}
        inert={isSheetOpen || isNotificationOpen ? true : undefined}
      >
        <nav
          aria-label="Mobile Navigation"
          className="relative isolate w-full max-w-[560px] mx-auto h-[60px] rounded-[30px] bg-white border border-[#E5E7EB] shadow-[0_4px_16px_rgba(10,11,13,0.06)] grid grid-cols-5 items-center pointer-events-auto"
          style={{ '--active-idx': activeIndex } as React.CSSProperties}
        >
          {/* SATU pil 52x34 meluncur */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1/5 flex items-center justify-center pointer-events-none z-0"
            style={{
              transform: `translate3d(calc(var(--active-idx) * 100%), 0, 0)`,
              opacity: isDiscover ? 0 : 1,
              transitionProperty: 'transform, opacity',
              transitionDuration: 'var(--dur-base)',
              transitionTimingFunction: 'var(--ease-out)',
            }}
          >
            <div className="w-[52px] h-[34px] rounded-full bg-[#EEF4FF]" />
          </div>

          {/* 1. Home */}
          <div className="relative z-10 h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => onTabChange('home')}
              aria-label={t.nav.home}
              className="w-full h-full flex items-center justify-center cursor-pointer transition-transform duration-[var(--dur-tap)] active:scale-[0.97]"
            >
              <div className="w-[52px] h-[34px] flex items-center justify-center">
                <LayoutGrid
                  className={`w-5 h-5 transition-colors duration-150 ${
                    currentTab === 'home' || currentTab === 'receive'
                      ? 'text-[#0052FF]'
                      : 'text-[#5B6577] hover:text-[#0A0B0D]'
                  }`}
                />
              </div>
            </button>
          </div>

          {/* 2. Friends */}
          <div className="relative z-10 h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => onTabChange('friends')}
              aria-label={t.nav.friends}
              className="w-full h-full flex items-center justify-center cursor-pointer transition-transform duration-[var(--dur-tap)] active:scale-[0.97]"
            >
              <div className="w-[52px] h-[34px] flex items-center justify-center">
                <Users
                  className={`w-5 h-5 transition-colors duration-150 ${
                    currentTab === 'friends'
                      ? 'text-[#0052FF]'
                      : 'text-[#5B6577] hover:text-[#0A0B0D]'
                  }`}
                />
              </div>
            </button>
          </div>

          {/* 3. Discover */}
          <div className="relative z-10 h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => onTabChange('discover')}
              aria-label={t.nav.discover}
              className="w-full h-full flex items-center justify-center cursor-pointer"
            >
              <div
                className={`w-11 h-11 -mt-4 rounded-full bg-[#0052FF] hover:bg-[#0042D6] text-white flex items-center justify-center shadow-md shadow-[#0052FF]/25 cursor-pointer transition-all duration-150 active:scale-[0.97] ${
                  isDiscover
                    ? 'ring-4 ring-[#EEF4FF] ring-offset-2 ring-offset-white'
                    : 'ring-4 ring-white'
                }`}
              >
                <Compass className="w-5 h-5" />
              </div>
            </button>
          </div>

          {/* 4. History */}
          <div className="relative z-10 h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => onTabChange('history')}
              aria-label={t.nav.history}
              className="w-full h-full flex items-center justify-center cursor-pointer transition-transform duration-[var(--dur-tap)] active:scale-[0.97]"
            >
              <div className="w-[52px] h-[34px] flex items-center justify-center">
                <History
                  className={`w-5 h-5 transition-colors duration-150 ${
                    currentTab === 'history'
                      ? 'text-[#0052FF]'
                      : 'text-[#5B6577] hover:text-[#0A0B0D]'
                  }`}
                />
              </div>
            </button>
          </div>

          {/* 5. Settings */}
          <div className="relative z-10 h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => onTabChange('settings')}
              aria-label={t.nav.settings}
              className="w-full h-full flex items-center justify-center cursor-pointer transition-transform duration-[var(--dur-tap)] active:scale-[0.97]"
            >
              <div className="w-[52px] h-[34px] flex items-center justify-center">
                <Settings
                  className={`w-5 h-5 transition-colors duration-150 ${
                    currentTab === 'settings' || currentTab === 'dev'
                      ? 'text-[#0052FF]'
                      : 'text-[#5B6577] hover:text-[#0A0B0D]'
                  }`}
                />
              </div>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}

