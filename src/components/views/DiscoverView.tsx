import React from 'react';
import {
  UserCheck,
  Droplets,
  Fingerprint,
  UserPlus,
  Send,
  ExternalLink,
  Check,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBalance } from '../../context/BalanceContext';
import { useTx } from '../../context/TxContext';
import { useFriends } from '../../context/FriendsContext';
import { useT } from '../../i18n';
import type { ActiveTab } from '../../types';

interface DiscoverViewProps {
  onNavigateToTab: (tab: ActiveTab) => void;
}

export function DiscoverView({ onNavigateToTab }: DiscoverViewProps) {
  const { t } = useT();
  const { profile, hasPasskeyMfa } = useAuth();
  const { usdc, usdcRaw } = useBalance();
  const { txs } = useTx();
  const { friends, openSend } = useFriends();

  // Read Discord URL directly from environment variable without touching config.ts
  const discordUrl = (import.meta.env.VITE_DISCORD_INVITE_URL || '').toString().trim();

  // 1. Mission a: Choose Pukico ID (completed if profile has a non-empty pukico_id)
  const isMissionADone = Boolean(profile?.pukico_id && profile.pukico_id.trim() !== '');

  // 2. Mission b: Get testnet tokens (completed if USDC balance > 0 or at least 1 confirmed incoming transfer)
  const hasPositiveUsdcBalance =
    (usdcRaw !== null && usdcRaw > 0n) ||
    (usdc.value !== null && parseFloat(usdc.value.replace(/,/g, '')) > 0);
  const hasIncomingConfirmedTx = txs.some(
    (tx) => (tx.direction === 'in' || tx.direction === 'incoming') && tx.status === 'confirmed'
  );
  const isMissionBDone = hasPositiveUsdcBalance || hasIncomingConfirmedTx;

  // 3. Mission c: Enable passkey (completed if passkey MFA is enrolled)
  const isMissionCDone = Boolean(hasPasskeyMfa);

  // 4. Mission d: Add a friend (completed if friends list has at least 1 contact)
  const isMissionDDone = friends.length >= 1;

  // 5. Mission e: Send first USDC (completed if at least 1 confirmed outgoing transfer exists)
  const isMissionEDone = txs.some(
    (tx) => (tx.direction === 'out' || tx.direction === 'outgoing') && tx.status === 'confirmed'
  );

  // 6. Mission f: Send to external address (completed if at least 1 confirmed outgoing transfer has is_external = true)
  const isMissionFDone = txs.some(
    (tx) =>
      (tx.direction === 'out' || tx.direction === 'outgoing') &&
      tx.status === 'confirmed' &&
      Boolean(tx.is_external)
  );

  const completedCount = [
    isMissionADone,
    isMissionBDone,
    isMissionCDone,
    isMissionDDone,
    isMissionEDone,
    isMissionFDone,
  ].filter(Boolean).length;

  const allComplete = completedCount === 6;
  const progressPercent = Math.round((completedCount / 6) * 100);

  const missions = [
    {
      id: 'claimId',
      title: t.discover.missions.claimId.title,
      desc: t.discover.missions.claimId.desc,
      icon: UserCheck,
      isDone: isMissionADone,
      actionText: null,
      onAction: undefined,
      note: null,
    },
    {
      id: 'faucet',
      title: t.discover.missions.faucet.title,
      desc: t.discover.missions.faucet.desc,
      icon: Droplets,
      isDone: isMissionBDone,
      actionText: t.discover.missions.faucet.action,
      onAction: () => onNavigateToTab('home'),
      note: null,
    },
    {
      id: 'passkey',
      title: t.discover.missions.passkey.title,
      desc: t.discover.missions.passkey.desc,
      icon: Fingerprint,
      isDone: isMissionCDone,
      actionText: t.discover.missions.passkey.action,
      onAction: () => onNavigateToTab('settings'),
      note: null,
    },
    {
      id: 'addFriend',
      title: t.discover.missions.addFriend.title,
      desc: t.discover.missions.addFriend.desc,
      icon: UserPlus,
      isDone: isMissionDDone,
      actionText: t.discover.missions.addFriend.action,
      onAction: () => onNavigateToTab('friends'),
      note: null,
    },
    {
      id: 'sendFirstUsdc',
      title: t.discover.missions.sendFirstUsdc.title,
      desc: t.discover.missions.sendFirstUsdc.desc,
      icon: Send,
      isDone: isMissionEDone,
      actionText: t.discover.missions.sendFirstUsdc.action,
      onAction: () => openSend(),
      note: null,
    },
    {
      id: 'sendExternal',
      title: t.discover.missions.sendExternal.title,
      desc: t.discover.missions.sendExternal.desc,
      icon: ExternalLink,
      isDone: isMissionFDone,
      actionText: t.discover.missions.sendExternal.action,
      onAction: () => openSend(),
      note: t.discover.missions.sendExternal.note,
    },
  ];

  return (
    <div className="w-full max-w-[560px] mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-up">
      {/* 1. Header */}
      <div>
        <h1 className="text-xl font-bold text-[#0A0B0D] tracking-tight">{t.discover.title}</h1>
        <p className="text-xs sm:text-sm text-[#5B6577] mt-1 leading-relaxed">
          {t.discover.subtitle}
        </p>
      </div>

      {/* 2. Progress Indicator / All Complete Banner */}
      {allComplete ? (
        <div className="p-4 rounded-2xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] flex items-center gap-2.5 text-xs sm:text-sm font-semibold shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-[#059669] shrink-0" />
          <span>{t.discover.allComplete}</span>
        </div>
      ) : (
        <div className="p-4 bg-white rounded-2xl border border-[#E5E7EB] shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#5B6577]">
            <span>
              {t.discover.progressText
                .replace('{completed}', String(completedCount))
                .replace('{total}', '6')}
            </span>
            <span className="font-mono text-[#0052FF]">{progressPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#EEF4FF] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0052FF] rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* 3. Missions Vertical List */}
      <div className="space-y-3">
        {missions.map((mission) => {
          const Icon = mission.icon;
          return (
            <div
              key={mission.id}
              className="p-4 bg-white rounded-2xl border border-[#E5E7EB] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                    mission.isDone
                      ? 'bg-[#ECFDF5] text-[#059669]'
                      : 'bg-[#EEF4FF] text-[#0052FF]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#0A0B0D] leading-snug">
                    {mission.title}
                  </div>
                  <div className="text-xs text-[#5B6577] mt-0.5 leading-relaxed">
                    {mission.desc}
                  </div>
                  {mission.note && (
                    <div className="text-[11px] text-[#5B6577] mt-1.5 bg-[#F7F8FA] px-2.5 py-1 rounded-lg border border-[#E5E7EB] inline-block">
                      {mission.note}
                    </div>
                  )}
                </div>
              </div>

              {/* Status / Action Button */}
              <div className="shrink-0 flex items-center sm:self-center pl-12 sm:pl-0">
                {mission.isDone ? (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#047857] text-xs font-semibold whitespace-nowrap">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{t.discover.completedBadge}</span>
                  </div>
                ) : mission.actionText && mission.onAction ? (
                  <button
                    type="button"
                    onClick={mission.onAction}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#0052FF] hover:bg-[#0042D6] text-white active:scale-[0.97] transition-all cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    {mission.actionText}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Help us improve (Discord) Card - hidden if VITE_DISCORD_INVITE_URL is empty */}
      {discordUrl && (
        <div className="p-4 bg-white rounded-2xl border border-[#E5E7EB] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#EEF4FF] text-[#0052FF] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#0A0B0D]">
                {t.discover.community.title}
              </div>
              <div className="text-xs text-[#5B6577] mt-0.5 leading-relaxed">
                {t.discover.community.text}
              </div>
            </div>
          </div>
          <div className="shrink-0 pl-12 sm:pl-0">
            <a
              href={discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-[#E5E7EB] hover:bg-[#EEF4FF] hover:border-[#0052FF]/30 text-[#0A0B0D] active:scale-[0.97] transition-all cursor-pointer whitespace-nowrap"
            >
              <span>{t.discover.community.action}</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#5B6577]" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
