import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCheck,
  ExternalLink,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { TxDetailsSheet } from './TxDetailsSheet';
import { useT } from '../../i18n';
import { useToast, type ToastKind, type StoredToastNotification } from '../../context/ToastContext';
import { useTx } from '../../context/TxContext';
import { formatRelativeTime } from '../../lib/formatters';
import type { TxRecord } from '../../lib/txApi';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function NotificationTypeIcon({ item }: { item: StoredToastNotification }) {
  if (item.type === 'incoming_tx') {
    return (
      <div className="w-8 h-8 rounded-xl bg-[#ECFDF5] text-[#047857] flex items-center justify-center shrink-0">
        <ArrowDownLeft className="w-4 h-4 stroke-[2.2]" />
      </div>
    );
  }

  if (item.type === 'outgoing_tx') {
    return (
      <div className="w-8 h-8 rounded-xl bg-[#EEF4FF] text-[#0052FF] flex items-center justify-center shrink-0">
        <ArrowUpRight className="w-4 h-4 stroke-[2.2]" />
      </div>
    );
  }

  switch (item.kind) {
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
  const { notifications, unreadCount, markAllRead, markNotificationRead, clearAll } = useToast();
  const { txs } = useTx();
  const [selectedTx, setSelectedTx] = useState<TxRecord | null>(null);

  // Automatically mark all as read after 1.5 seconds of panel being open
  useEffect(() => {
    let timer: number | null = null;
    if (isOpen && notifications.some((n) => !n.read)) {
      timer = window.setTimeout(() => {
        markAllRead();
      }, 1500);
    }
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [isOpen, notifications, markAllRead]);

  const handleNotificationClick = (item: StoredToastNotification) => {
    if (!item.read) {
      markNotificationRead(item.id);
    }

    if (item.tx_hash) {
      // Find matching TxRecord from TxContext or build one
      const found = txs.find((t) => t.tx_hash.toLowerCase() === item.tx_hash?.toLowerCase());
      if (found) {
        setSelectedTx(found);
      } else {
        setSelectedTx({
          tx_hash: item.tx_hash,
          direction: item.type === 'incoming_tx' ? 'in' : 'out',
          asset: (item.asset as 'USDC' | 'ETH') || 'USDC',
          amount: item.amount || '0',
          counterparty: item.counterparty || '',
          to_pukico_id: item.type === 'incoming_tx' ? undefined : item.counterparty,
          from_pukico_id: item.type === 'incoming_tx' ? item.counterparty : undefined,
          status: 'confirmed',
          created_at: item.created_at,
          confirmed_at: item.created_at,
        });
      }
    }
  };

  return (
    <>
      <BottomSheet
        open={isOpen}
        onClose={onClose}
        title={t.notifications.title}
        contentClassName="px-5 pt-0 sheet-body-pad"
      >
        <div className="select-none">
          {notifications.length > 0 && (
            <div className="flex items-center justify-between pb-3 pt-1 border-b border-[#E5E7EB] gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#5B6577] font-medium">
                  {notifications.length} {t.notifications.title.toLowerCase()}
                </span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#EEF4FF] text-[#0052FF] text-[11px] font-semibold">
                    {t.notifications.unreadCount.replace('{count}', String(unreadCount))}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0052FF] hover:bg-[#EEF4FF] px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    aria-label={t.notifications.markAllRead}
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>{t.notifications.markAllRead}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#DC2626] hover:text-[#B91C1C] hover:bg-red-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                  aria-label={t.notifications.clearAll}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.notifications.clearAll}</span>
                </button>
              </div>
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
              {notifications.map((item) => {
                const isIncoming = item.type === 'incoming_tx';
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`w-full text-left flex items-start gap-3 py-3.5 px-2 rounded-xl transition-all cursor-pointer ${
                      !item.read ? 'bg-[#F0F5FF]/60 hover:bg-[#EEF4FF]' : 'hover:bg-[#F9FAFB]'
                    }`}
                  >
                    {/* Unread indicator dot */}
                    <div className="pt-2 flex items-center justify-center w-2 shrink-0">
                      {!item.read ? (
                        <span className="w-2 h-2 rounded-full bg-[#0052FF] ring-2 ring-[#BFDBFE]" />
                      ) : (
                        <span className="w-2 h-2" />
                      )}
                    </div>

                    {/* Icon per type */}
                    <NotificationTypeIcon item={item} />

                    {/* Message & Relative timestamp */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p
                          className={`text-xs ${
                            !item.read ? 'font-bold text-[#0A0B0D]' : 'font-medium text-[#5B6577]'
                          }`}
                        >
                          {isIncoming && item.counterparty
                            ? t.notifications.incomingFrom.replace('{sender}', item.counterparty)
                            : item.title || t.notifications.title}
                        </p>
                        <span className="text-[11px] text-[#5B6577] shrink-0 font-normal">
                          {formatRelativeTime(item.created_at, lang)}
                        </span>
                      </div>

                      <p
                        className={`text-sm leading-snug break-words ${
                          !item.read ? 'font-semibold text-[#0A0B0D]' : 'font-normal text-[#3B4455]'
                        }`}
                      >
                        {item.message}
                      </p>

                      {isIncoming && item.amount && item.asset && (
                        <div className="mt-1 flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-[#047857] bg-[#ECFDF5] px-2 py-0.5 rounded-md">
                            +{item.amount} {item.asset}
                          </span>
                          {item.tx_hash && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0052FF] hover:underline">
                              <span>{t.notifications.viewDetails}</span>
                              <ExternalLink className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Embedded TxDetailsSheet when user taps a transaction notification */}
      {selectedTx && (
        <TxDetailsSheet
          open={Boolean(selectedTx)}
          onClose={() => setSelectedTx(null)}
          tx={selectedTx}
        />
      )}
    </>
  );
}
