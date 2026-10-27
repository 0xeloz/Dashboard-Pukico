import React from 'react';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useT } from '../../i18n';
import { formatRelativeTime, formatAssetAmount } from '../../lib/formatters';
import type { TxRecord } from '../../lib/txApi';

export interface ActivityItem {
  id?: string;
  tx_hash?: string;
  type?: 'incoming' | 'outgoing';
  direction?: 'in' | 'out' | 'incoming' | 'outgoing';
  targetId?: string;
  counterparty?: string;
  to_pukico_id?: string;
  from_pukico_id?: string;
  timestamp?: string;
  created_at?: string;
  network?: string;
  amount: string;
  currency?: 'USDC' | 'ETH';
  asset?: 'USDC' | 'ETH';
  status: 'Confirmed' | 'Pending' | 'Failed' | 'confirmed' | 'pending' | 'failed';
  explorer_url?: string;
}

interface ActivityRowProps {
  activity: ActivityItem | TxRecord;
  onClick?: () => void;
}

export function ActivityRow({ activity, onClick }: ActivityRowProps) {
  const { t, lang, fmt } = useT();

  const isIncoming =
    activity.direction === 'in' ||
    activity.direction === 'incoming' ||
    ('type' in activity && activity.type === 'incoming');

  const rawStatus = (activity.status || 'confirmed').toLowerCase();
  const isPending = rawStatus === 'pending';
  const isFailed = rawStatus === 'failed';
  const isConfirmed = !isPending && !isFailed;

  const statusColorClass = isPending
    ? 'text-[#B45309]'
    : isFailed
    ? 'text-[#B91C1C]'
    : 'text-[#5B6577]';

  const localizedStatus = isPending
    ? t.history.pending
    : isFailed
    ? t.history.failed
    : t.history.confirmed;

  const counterparty = (
    activity.counterparty ||
    ('targetId' in activity ? activity.targetId : '') ||
    activity.to_pukico_id ||
    activity.from_pukico_id ||
    ''
  ).replace(/^@/, '');

  const asset = activity.asset || ('currency' in activity ? activity.currency : 'USDC') || 'USDC';

  const rawTimestamp =
    activity.created_at ||
    ('timestamp' in activity ? activity.timestamp : '') ||
    '';

  // If timestamp is already relative like "31m", use it; otherwise format with Intl.RelativeTimeFormat
  let relativeTimeStr = rawTimestamp;
  if (rawTimestamp && (rawTimestamp.includes('T') || rawTimestamp.includes('-') || !isNaN(Number(rawTimestamp)))) {
    relativeTimeStr = formatRelativeTime(rawTimestamp, lang);
  }

  const formattedAmount = fmt.asset(activity.amount, asset);
  const prefix = isIncoming ? t.history.from : t.history.to;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`flex items-center justify-between py-3 border-b border-[#E5E7EB] ${
        onClick
          ? 'cursor-pointer hover:bg-[#F9FAFB] active:bg-[#F3F4F6] transition-colors duration-[var(--dur-tap)] select-none'
          : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Kotak ikon 40px (radius 14px): keluar abu #F3F4F6, masuk #ECFDF5 */}
        <div
          className={`w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 ${
            isIncoming ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-[#F3F4F6] text-[#0A0B0D]'
          }`}
        >
          {isIncoming ? (
            <ArrowDownLeft className="w-4 h-4 text-[#047857]" />
          ) : (
            <ArrowUpRight className="w-4 h-4 text-[#0A0B0D]" />
          )}
        </div>

        {/* Text information */}
        <div className="min-w-0">
          <div className="font-semibold text-sm text-[#0A0B0D] truncate">
            {prefix} @{counterparty || '—'}
          </div>
          <div className="text-xs text-[#5B6577] mt-0.5">
            {relativeTimeStr ? `${relativeTimeStr} · Base Sepolia` : 'Base Sepolia'}
          </div>
        </div>
      </div>

      {/* Amount & Status */}
      <div className="text-right shrink-0">
        <div
          className={`font-mono text-sm font-semibold tabular-nums ${
            isIncoming ? 'text-[#047857]' : 'text-[#0A0B0D]'
          }`}
        >
          {isIncoming ? `+${formattedAmount}` : `-${formattedAmount}`} {asset}
        </div>
        <div className={`text-xs mt-0.5 font-medium ${statusColorClass}`}>
          {localizedStatus}
        </div>
      </div>
    </div>
  );
}
