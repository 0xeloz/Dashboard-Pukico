import React from 'react';
import { Users, Compass, History } from 'lucide-react';
import type { ActiveTab } from '../../types';

interface ComingSoonViewProps {
  tab: ActiveTab;
}

const TAB_CONFIG: Record<string, { title: string; desc: string; icon: React.ElementType }> = {
  friends: {
    title: 'Friends',
    desc: 'Social contacts, ENS/Pukico lookups, and P2P transfers are scheduled for Phase 2.',
    icon: Users,
  },
  discover: {
    title: 'Discover',
    desc: 'Curated Base Sepolia apps, community incentives, and testnet dApps.',
    icon: Compass,
  },
  history: {
    title: 'History',
    desc: 'On-chain transaction logs, event decoders, and transfer receipts.',
    icon: History,
  },
};

export function ComingSoonView({ tab }: ComingSoonViewProps) {
  const config = TAB_CONFIG[tab] || {
    title: 'Feature',
    desc: 'This module is in active development.',
    icon: History,
  };

  const IconComponent = config.icon;

  return (
    <div className="w-full max-w-[560px] mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-up">
      {/* Datar langsung di latar #F7F8FA tanpa kartu, border keliling, atau shadow */}
      <div className="py-6 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-[20px] bg-[#EEF4FF] flex items-center justify-center mb-4">
          <IconComponent className="w-8 h-8 text-[#0052FF]" />
        </div>

        <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#FFFBEB] text-[#B45309] text-xs font-semibold uppercase tracking-wider mb-3">
          Coming soon
        </div>

        <h2 className="text-xl font-bold text-[#0A0B0D] mb-2">{config.title}</h2>
        <p className="text-sm text-[#5B6577] leading-relaxed max-w-sm mb-6">{config.desc}</p>

        <div className="pt-4 border-t border-[#E5E7EB] w-full text-left">
          <div className="text-xs font-bold text-[#0A0B0D] mb-1 uppercase tracking-wider">
            Phase 1 Scope
          </div>
          <p className="text-xs text-[#5B6577] leading-relaxed">
            Current milestone covers authentication, session management, wallet address display, and Base Sepolia USDC & ETH tracking.
          </p>
        </div>
      </div>
    </div>
  );
}
