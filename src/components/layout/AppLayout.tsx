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
import type { ActiveTab, UserProfile } from '../../types';

interface AppLayoutProps {
  currentTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  profile: UserProfile;
  isDemoMode: boolean;
  isSheetOpen?: boolean;
  children: React.ReactNode;
}

export function AppLayout({
  currentTab,
  onTabChange,
  profile,
  isDemoMode,
  isSheetOpen = false,
  children,
}: AppLayoutProps) {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Pukico ID validation: only a-z, 0-9, and _
  const hasPukicoId = Boolean(profile.pukico_id && profile.pukico_id.trim().length > 0);
  const sanitizedId = profile.pukico_id ? profile.pukico_id.replace(/^@/, '').replace(/[^a-zA-Z0-9_]/g, '') : '';
  const formattedPukicoId = sanitizedId ? `@${sanitizedId}` : '';

  const handleCopyId = async () => {
    if (!formattedPukicoId) return;
    try {
      await navigator.clipboard.writeText(formattedPukicoId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = formattedPukicoId;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const isAdmin = profile.role === 'admin';

  // Demo banner: only rendered when VITE_DEMO_MODE=true (or mock in AI Studio evaluation)
  const isViteDemoMode =
    import.meta.env.VITE_DEMO_MODE === 'true' ||
    import.meta.env.VITE_DEMO_MODE === 'Mock';
  const showDemoBanner = isDemoMode && isViteDemoMode;

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
              src="/pukico-logo-white.png"
              alt="Pukico"
              className="w-[22px] h-[22px] object-contain invert brightness-0"
            />
            <span className="font-semibold text-base text-[#0A0B0D] tracking-tight">
              Pukico
            </span>
            <span className="text-[11px] font-medium text-[#0052FF] bg-[#EEF4FF] px-1.5 py-0.5 rounded-full ml-auto">
              Testnet
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="space-y-2" aria-label="Desktop Navigation">
            {/* 1. Home */}
            <button
              type="button"
              onClick={() => onTabChange('home')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                currentTab === 'home' || currentTab === 'receive'
                  ? 'bg-[#EEF4FF] text-[#0052FF] font-semibold'
                  : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              <LayoutGrid className="w-5 h-5 shrink-0" />
              <span>Home</span>
            </button>

            {/* 2. Friends */}
            <button
              type="button"
              onClick={() => onTabChange('friends')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                currentTab === 'friends'
                  ? 'bg-[#EEF4FF] text-[#0052FF] font-semibold'
                  : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              <Users className="w-5 h-5 shrink-0" />
              <span>Friends</span>
            </button>

            {/* 3. Discover (Highlighted blue in the center of list) */}
            <button
              type="button"
              onClick={() => onTabChange('discover')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                currentTab === 'discover'
                  ? 'bg-[#0052FF] text-white'
                  : 'bg-[#EEF4FF] text-[#0052FF] hover:bg-[#E0ECFF]'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <Compass className="w-5 h-5 shrink-0" />
                <span>Discover</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 uppercase tracking-wider font-bold">
                Hub
              </span>
            </button>

            {/* 4. History */}
            <button
              type="button"
              onClick={() => onTabChange('history')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                currentTab === 'history'
                  ? 'bg-[#EEF4FF] text-[#0052FF] font-semibold'
                  : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              <History className="w-5 h-5 shrink-0" />
              <span>History</span>
            </button>

            {/* 5. Settings */}
            <button
              type="button"
              onClick={() => onTabChange('settings')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                currentTab === 'settings'
                  ? 'bg-[#EEF4FF] text-[#0052FF] font-semibold'
                  : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
              }`}
            >
              <Settings className="w-5 h-5 shrink-0" />
              <span>Settings</span>
            </button>

            {/* /dev for Admin */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => onTabChange('dev')}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                  currentTab === 'dev'
                    ? 'bg-[#0A0B0D] text-white font-semibold'
                    : 'text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6]'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <Terminal className="w-5 h-5 shrink-0" />
                  <span>/dev Console</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold uppercase">
                  Admin
                </span>
              </button>
            )}
          </nav>
        </div>

        {/* Desktop Profile Summary - Flat style with top border */}
        <div className="pt-4 border-t border-[#E5E7EB]">
          <div className="text-[11px] font-medium text-[#5B6577] mb-1">Current Session</div>
          <div className="font-mono text-xs font-bold text-[#0A0B0D] truncate">
            {formattedPukicoId ? formattedPukicoId : 'No Pukico ID yet'}
          </div>
          <div className="font-mono text-[10px] text-[#5B6577] truncate mt-1">
            {profile.wallet_address.slice(0, 6)}...{profile.wallet_address.slice(-4)}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-24 lg:pb-8">
        {/* Banner demo tipis: tinggi 28px, teks 12px, hanya dirender saat VITE_DEMO_MODE=true */}
        {showDemoBanner && (
          <div
            role="status"
            className="w-full h-7 bg-[#FFFBEB] border-b border-[#FDE68A] px-4 text-[#92400E] text-xs font-medium flex items-center justify-center gap-1.5 shrink-0 select-none"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#B45309]" />
            <span className="font-bold tracking-tight">DEMO DATA, not connected</span>
          </div>
        )}

        {/* TOPBAR (Tidak sticky, tinggi 56px, padding 16px, jarak elemen 8px) */}
        <header className="w-full h-14 px-4 py-2 shrink-0">
          <div className="w-full max-w-[560px] mx-auto flex items-center justify-between gap-2 h-full">
            {/* Kiri: pil ID tinggi 36px, teks 13px */}
            <div className="h-9 px-3 bg-white border border-[#E5E7EB] rounded-full flex items-center gap-2">
              {formattedPukicoId ? (
                <>
                  {/* Titik hijau #10B981 (hanya saat session sukses) */}
                  <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                  {/* @pukico_id dalam monospace teks 13px */}
                  <span className="font-mono text-[13px] font-semibold text-[#0A0B0D] select-all">
                    {formattedPukicoId}
                  </span>
                  {/* Tombol Copy kecil dengan umpan balik "Copied" */}
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="p-1 text-[#5B6577] hover:text-[#0A0B0D] rounded-full transition-colors cursor-pointer"
                    aria-label={copiedId ? 'Copied' : 'Copy Pukico ID'}
                    title={copiedId ? 'Copied!' : 'Copy Pukico ID'}
                  >
                    {copiedId ? (
                      <Check className="w-3.5 h-3.5 text-[#047857]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {copiedId && (
                    <span className="text-[10px] font-semibold text-[#047857] animate-fade-up">
                      Copied
                    </span>
                  )}
                </>
              ) : (
                /* Jika pukico_id kosong, tampilkan "No Pukico ID yet" tanpa tombol copy dan tanpa titik hijau */
                <span className="text-[13px] font-medium text-[#5B6577]">
                  No Pukico ID yet
                </span>
              )}
            </div>

            {/* Kanan: pil jaringan tinggi 36px, lalu lonceng 36x36 (jarak 8px) */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Network Pill tinggi 36px */}
              <div className="h-9 px-2.5 bg-white border border-[#E5E7EB] rounded-full flex items-center gap-1.5">
                {/* Generic blue circle network icon */}
                <GenericNetworkIcon className="w-3.5 h-3.5 shrink-0" />
                {/* Chip "Testnet" (latar #EEF4FF, teks #0052FF) */}
                <span className="px-1.5 py-0.5 rounded-full bg-[#EEF4FF] text-[#0052FF] text-[11px] font-semibold">
                  Testnet
                </span>
              </div>

              {/* Lonceng 36x36 bulat */}
              <button
                type="button"
                onClick={() => setIsNotificationOpen(true)}
                className="w-9 h-9 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#EEF4FF] transition-all cursor-pointer active:scale-[0.98]"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 w-full pt-1">
          {children}
        </main>
      </div>

      {/* NAVBAR BAWAH (Mobile floating pill, tinggi 60px, radius 30px, margin sisi 12px, grid 5 kolom sama lebar) */}
      <div
        className={`lg:hidden fixed bottom-3 left-0 right-0 z-40 px-3 pointer-events-none pb-safe transition-all duration-250 ease-out ${
          isSheetOpen
            ? 'translate-y-[calc(100%+24px)] opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100'
        }`}
        aria-hidden={isSheetOpen ? true : undefined}
        inert={isSheetOpen ? true : undefined}
      >
        <nav
          aria-label="Mobile Navigation"
          className="w-full max-w-[560px] mx-auto h-[60px] rounded-[30px] bg-white border border-[#E5E7EB] shadow-[0_4px_16px_rgba(10,11,13,0.06)] grid grid-cols-5 items-center pointer-events-auto"
        >
          {/* 1. Home (LayoutGrid, pil aktif 52x34 di tengah kolom) */}
          <div className="h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => onTabChange('home')}
              aria-label="Home"
              className={`w-[52px] h-[34px] rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                currentTab === 'home' || currentTab === 'receive'
                  ? 'bg-[#EEF4FF] text-[#0052FF]'
                  : 'text-[#5B6577] hover:text-[#0A0B0D]'
              }`}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
          </div>

          {/* 2. Friends (Users) */}
          <div className="h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => onTabChange('friends')}
              aria-label="Friends"
              className={`w-[52px] h-[34px] rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                currentTab === 'friends'
                  ? 'bg-[#EEF4FF] text-[#0052FF]'
                  : 'text-[#5B6577] hover:text-[#0A0B0D]'
              }`}
            >
              <Users className="w-5 h-5" />
            </button>
          </div>

          {/* 3. Discover (Tombol tengah 44px, terangkat 10px di atas pil di dalam sel ke-3 tanpa mendorong kolom lain) */}
          <div className="relative h-full flex items-center justify-center">
            <div className="absolute -top-2.5 flex items-center justify-center">
              <button
                type="button"
                onClick={() => onTabChange('discover')}
                aria-label="Discover"
                className="w-11 h-11 rounded-full bg-[#0052FF] hover:bg-[#0042D6] text-white flex items-center justify-center ring-4 ring-white shadow-md shadow-[#0052FF]/25 transition-all duration-150 cursor-pointer active:scale-[0.95]"
              >
                <Compass className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 4. History (History) */}
          <div className="h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => onTabChange('history')}
              aria-label="History"
              className={`w-[52px] h-[34px] rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                currentTab === 'history'
                  ? 'bg-[#EEF4FF] text-[#0052FF]'
                  : 'text-[#5B6577] hover:text-[#0A0B0D]'
              }`}
            >
              <History className="w-5 h-5" />
            </button>
          </div>

          {/* 5. Settings (Settings) */}
          <div className="h-full flex items-center justify-center">
            <button
              type="button"
              onClick={() => onTabChange('settings')}
              aria-label="Settings"
              className={`w-[52px] h-[34px] rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-[0.98] ${
                currentTab === 'settings' || currentTab === 'dev'
                  ? 'bg-[#EEF4FF] text-[#0052FF]'
                  : 'text-[#5B6577] hover:text-[#0A0B0D]'
              }`}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
