import React, { useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { useT } from '../../i18n';
import { useToast, type ToastKind } from '../../context/ToastContext';
import { formatRelativeTime } from '../../lib/formatters';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function NotificationKindIcon({ kind }: { kind: ToastKind }) {
  switch (kind) {
    case 'success':
      return (
        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#047857] flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    case 'error':
      return (
        <div className="w-8 h-8 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center shrink-0">
          <AlertCircle className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    case 'warning':
      return (
        <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#D97706] flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    case 'info':
    default:
      return (
        <div className="w-8 h-8 rounded-xl bg-[#EEF4FF] text-[#0052FF] flex items-center justify-center shrink-0">
          <Info className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
  }
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { t, lang } = useT();
  const { notifications, markAllRead, clearAll } = useToast();

  // Automatically mark all as read after 1 second of opening
  useEffect(() => {
    let timer: number | null = null;
    if (isOpen && notifications.some((n) => !n.read)) {
      timer = window.setTimeout(() => {
        markAllRead();
      }, 1000);
    }
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [isOpen, notifications, markAllRead]);

  return (
    <BottomSheet
      open={isOpen}
      onClose={onClose}
      title={t.notifications.title}
      contentClassName="px-5 pt-0 sheet-body-pad"
    >
      <div className="select-none">
        {notifications.length > 0 && (
          <div className="flex items-center justify-between pb-3 pt-1 border-b border-[#E5E7EB]">
            <span className="text-xs text-[#5B6577] font-medium">
              {notifications.length} {t.notifications.title.toLowerCase()}
            </span>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC2626] hover:text-[#B91C1C] hover:bg-red-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t.notifications.clearAll}</span>
            </button>
          </div>
        )}

        {notifications.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF4FF] flex items-center justify-center mb-3">
              <Bell className="w-6 h-6 text-[#0052FF]" />
            </div>
            <p className="font-semibold text-[#0A0B0D] text-base mb-1">
              {t.notifications.emptyTitle}
            </p>
            <p className="text-sm text-[#5B6577] max-w-xs leading-relaxed">
              {t.notifications.emptyDesc}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {notifications.map((item) => (
              <div
                key={item.id}
                className="w-full text-left flex items-start gap-3 py-3.5 px-1 hover:bg-[#F9FAFB] rounded-xl transition-colors"
              >
                {/* Unread indicator dot */}
                <div className="pt-2 flex items-center justify-center w-2 shrink-0">
                  {!item.read ? (
                    <span className="w-2 h-2 rounded-full bg-[#0052FF]" />
                  ) : (
                    <span className="w-2 h-2" />
                  )}
                </div>

                {/* Icon per type */}
                <NotificationKindIcon kind={item.kind} />

                {/* Message & Relative timestamp */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <p
                    className={`text-sm leading-snug break-words ${
                      !item.read ? 'font-semibold text-[#0A0B0D]' : 'font-normal text-[#3B4455]'
                    }`}
                  >
                    {item.message}
                  </p>
                  <p className="text-xs text-[#5B6577] mt-1">
                    {formatRelativeTime(item.created_at, lang)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
