import React from 'react';
import { Bell, X } from 'lucide-react';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Notifications"
      className="fixed inset-0 z-50 flex items-start justify-end sm:p-4 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm h-full sm:h-auto sm:max-h-[85vh] bg-white sm:rounded-2xl shadow-xl border border-[#E5E7EB] flex flex-col overflow-hidden transition-transform duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#0A0B0D]" />
            <h3 className="font-semibold text-[#0A0B0D] text-base">Notifications</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#3B4455] hover:text-[#0A0B0D] hover:bg-[#EEF4FF] rounded-lg transition-colors cursor-pointer"
            aria-label="Close notification panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content: Honest empty state */}
        <div className="p-8 flex flex-col items-center justify-center text-center my-auto">
          <div className="w-12 h-12 rounded-2xl bg-[#EEF4FF] flex items-center justify-center mb-3">
            <Bell className="w-6 h-6 text-[#0052FF]" />
          </div>
          <p className="font-medium text-[#0A0B0D] text-base mb-1">No notifications yet</p>
          <p className="text-sm text-[#3B4455]">
            Activity, incoming transfers, and system alerts will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
