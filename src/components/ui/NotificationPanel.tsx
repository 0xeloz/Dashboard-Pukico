import React from 'react';
import { Bell } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { useT } from '../../i18n';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { t } = useT();

  return (
    <BottomSheet open={isOpen} onClose={onClose} title={t.notifications.title}>
      <div className="py-8 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#EEF4FF] flex items-center justify-center mb-3">
          <Bell className="w-6 h-6 text-[#0052FF]" />
        </div>
        <p className="font-semibold text-[#0A0B0D] text-base mb-1">{t.notifications.emptyTitle}</p>
        <p className="text-sm text-[#5B6577] max-w-xs leading-relaxed">
          {t.notifications.emptyDesc}
        </p>
      </div>
    </BottomSheet>
  );
}

