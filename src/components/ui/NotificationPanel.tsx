import React from 'react';
import { Bell } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  return (
    <BottomSheet open={isOpen} onClose={onClose} title="Notifications">
      <div className="py-8 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#EEF4FF] flex items-center justify-center mb-3">
          <Bell className="w-6 h-6 text-[#0052FF]" />
        </div>
        <p className="font-semibold text-[#0A0B0D] text-base mb-1">No notifications yet.</p>
        <p className="text-sm text-[#5B6577] max-w-xs leading-relaxed">
          Activity, incoming transfers, and system alerts will appear here.
        </p>
      </div>
    </BottomSheet>
  );
}
