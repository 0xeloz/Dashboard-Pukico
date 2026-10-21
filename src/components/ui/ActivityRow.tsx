import React from 'react';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export interface ActivityItem {
  id: string;
  type: 'incoming' | 'outgoing';
  targetId: string;
  timestamp: string;
  network: string;
  amount: string;
  currency: 'USDC' | 'ETH';
  status: 'Confirmed' | 'Pending' | 'Failed';
}

interface ActivityRowProps {
  activity: ActivityItem;
}

export function ActivityRow({ activity }: ActivityRowProps) {
  const isIncoming = activity.type === 'incoming';

  const statusColorClass =
    activity.status === 'Confirmed'
      ? 'text-[#5B6577]'
      : activity.status === 'Pending'
      ? 'text-[#B45309]'
      : 'text-[#B91C1C]';

  return (
    <div className="flex items-center justify-between p-3 sm:p-3.5 rounded-2xl bg-white border border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {/* Kotak ikon 40px (radius 14px) */}
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
            {isIncoming ? `From @${activity.targetId.replace(/^@/, '')}` : `To @${activity.targetId.replace(/^@/, '')}`}
          </div>
          <div className="text-xs text-[#5B6577] mt-0.5">
            {activity.timestamp} · {activity.network}
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
          {isIncoming ? `+${activity.amount}` : `-${activity.amount}`} {activity.currency}
        </div>
        <div className={`text-xs mt-0.5 font-medium ${statusColorClass}`}>
          {activity.status}
        </div>
      </div>
    </div>
  );
}
