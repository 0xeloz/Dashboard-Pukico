import React, { useEffect, useState } from 'react';
import { Bell, ArrowUpRight, ArrowDownLeft, AlertCircle } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { TxDetailsSheet } from './TxDetailsSheet';
import { useT } from '../../i18n';
import { useTx } from '../../context/TxContext';
import { formatRelativeTime, formatAmountNumber } from '../../lib/formatters';
import type { TxRecord, TxNotification } from '../../lib/txApi';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { t, lang } = useT();
  const { notifications, txs, markRead } = useTx();
  const [selectedTx, setSelectedTx] = useState<TxRecord | null>(null);

  // When sheet is open for 1 second, call mark_read and update state
  useEffect(() => {
    let timer: number | null = null;
    if (isOpen) {
      timer = window.setTimeout(() => {
        markRead();
      }, 1000);
    }
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [isOpen, markRead]);

  const handleItemClick = (item: TxNotification) => {
    const matchingTx = txs.find(
      (t) => t.tx_hash && item.tx_hash && t.tx_hash.toLowerCase() === item.tx_hash.toLowerCase()
    );

    const txToOpen: TxRecord = matchingTx || {
      tx_hash: item.tx_hash,
      direction: item.kind === 'tx_received' ? 'in' : 'out',
      asset: item.data.asset,
      amount: item.data.amount,
      counterparty: item.data.counterparty,
      status: item.kind === 'tx_failed' ? 'failed' : 'confirmed',
      created_at: item.created_at,
      explorer_url: `https://sepolia.basescan.org/tx/${item.tx_hash}`,
    };

    setSelectedTx(txToOpen);
  };

  const renderMessage = (item: TxNotification) => {
    const formattedAmount = formatAmountNumber(item.data.amount, lang);
    const counterparty = item.data.counterparty.replace(/^@/, '');

    if (item.kind === 'tx_received') {
      return t.notifications.received
        .replace('{amount}', formattedAmount)
        .replace('{asset}', item.data.asset)
        .replace('{id}', counterparty);
    }
    if (item.kind === 'tx_failed') {
      return t.notifications.failed.replace('{id}', counterparty);
    }
    return t.notifications.sent
      .replace('{amount}', formattedAmount)
      .replace('{asset}', item.data.asset)
      .replace('{id}', counterparty);
  };

  return (
    <>
      <BottomSheet open={isOpen} onClose={onClose} title={t.notifications.title}>
        <div className="py-2 select-none">
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
            <div className="divide-y divide-[#E5E7EB] border-t border-b border-[#E5E7EB]">
              {notifications.map((item) => {
                const isReceived = item.kind === 'tx_received';
                const isFailed = item.kind === 'tx_failed';

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left flex items-start gap-3 py-3.5 px-1 hover:bg-[#F9FAFB] active:bg-[#F3F4F6] transition-colors cursor-pointer"
                  >
                    {/* Unread indicator dot */}
                    <div className="pt-2 flex items-center justify-center w-2 shrink-0">
                      {!item.read ? (
                        <span className="w-2 h-2 rounded-full bg-[#0052FF]" />
                      ) : (
                        <span className="w-2 h-2" />
                      )}
                    </div>

                    {/* Icon container */}
                    <div
                      className={`w-9 h-9 rounded-[12px] flex items-center justify-center shrink-0 ${
                        isReceived
                          ? 'bg-[#ECFDF5] text-[#047857]'
                          : isFailed
                          ? 'bg-[#FEF2F2] text-[#B91C1C]'
                          : 'bg-[#F3F4F6] text-[#0A0B0D]'
                      }`}
                    >
                      {isReceived ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : isFailed ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>

                    {/* Message & Relative timestamp */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm leading-snug break-words ${
                          !item.read ? 'font-semibold text-[#0A0B0D]' : 'font-normal text-[#3B4455]'
                        }`}
                      >
                        {renderMessage(item)}
                      </p>
                      <p className="text-xs text-[#5B6577] mt-1">
                        {formatRelativeTime(item.created_at, lang)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Details sheet opened when clicking a notification */}
      <TxDetailsSheet
        open={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        tx={selectedTx}
      />
    </>
  );
}
