import React from 'react';
import { Users, Compass, History } from 'lucide-react';
import { useT } from '../../i18n';
import type { ActiveTab } from '../../types';

interface ComingSoonViewProps {
  tab: ActiveTab;
}

export function ComingSoonView({ tab }: ComingSoonViewProps) {
  const { t } = useT();

  let title = t.comingSoon.featureTitle;
  let desc = t.comingSoon.featureDesc;
  let IconComponent = History;

  if (tab === 'friends') {
    title = t.comingSoon.friendsTitle;
    desc = t.comingSoon.friendsDesc;
    IconComponent = Users;
  } else if (tab === 'discover') {
    title = t.comingSoon.discoverTitle;
    desc = t.comingSoon.discoverDesc;
    IconComponent = Compass;
  } else if (tab === 'history') {
    title = t.comingSoon.historyTitle;
    desc = t.comingSoon.historyDesc;
    IconComponent = History;
  }

  return (
    <div className="w-full max-w-[560px] mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-up">
      <div className="py-6 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-[20px] bg-[#EEF4FF] flex items-center justify-center mb-4">
          <IconComponent className="w-8 h-8 text-[#0052FF]" />
        </div>

        <div className="inline-flex items-center px-3 py-1 rounded-full bg-[#FFFBEB] text-[#B45309] text-[13px] font-semibold mb-3">
          {t.comingSoon.badge}
        </div>

        <h2 className="text-xl font-bold text-[#0A0B0D] mb-2">{title}</h2>
        <p className="text-sm text-[#5B6577] leading-relaxed max-w-sm mb-6">{desc}</p>

        <div className="pt-4 border-t border-[#E5E7EB] w-full text-left">
          <div className="text-[13px] font-semibold text-[#5B6577] mb-1">
            {t.comingSoon.currentScope}
          </div>
          <p className="text-xs text-[#5B6577] leading-relaxed">
            {t.comingSoon.scopeDesc}
          </p>
        </div>
      </div>
    </div>
  );
}

