import React, { useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { TxDetailsSheet } from './TxDetailsSheet';
import { useT } from '../../i18n';
import { useToast, type StoredToastNotification } from '../../context/ToastContext';
import {
  useNotifications,
  type ServerNotificationItem,
} from '../../context/NotificationsContext';
import { formatRelativeTime, formatAssetAmount } from '../../lib/formatters';
import { shortenAddress } from '../../lib/txApi';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UnifiedNotification {
  id: string;
  source: 'server' | 'local';
  kind: string;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  tx_hash?: string;
  serverItem?: ServerNotificationItem;
}

function NotificationTypeIcon({ kind }: { kind: string }) {
  if (kind === 'tx_received') {
    return (
      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#047857] flex items-center justify-center shrink-0">
        <ArrowDownLeft className="w-4 h-4 stroke-[2.2]" />
      </div>
    );
  }

  if (kind === 'tx_sent') {
    return (
      <div className="w-8 h-8 rounded-xl bg-[#EEF4FF] text-[#0052FF] flex items-center justify-center shrink-0">
        <ArrowUpRight className="w-4 h-4 stroke-[2.2]" />
      </div>
    );
  }

  if (kind === 'tx_failed' || kind === 'error') {
    return (
      <div className="w-8 h-8 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4 stroke-[2.2]" />
      </div>
    );
  }

  if (kind === 'warning') {
    return (
      <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#D97706] flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4 stroke-[2.2]" />
      </div>
    );
  }

  if (kind === 'success') {
    return (
      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#047857] flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-4 h-4 stroke-[2.2]" />
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-xl bg-[#EEF4FF] text-[#0052FF] flex items-center justify-center shrink-0">
      <Info className="w-4 h-4 stroke-[2.2]" />
    </div>
  );
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { t, lang, fmt } = useT();
  const {
    notifications: localNotifications,
    unreadCount: localUnreadCount,
    markAllRead: markAllReadLocal,
    clearAll: clearAllLocal,
  } = useToast();

  const {
    items: serverItems,
    unreadCount: serverUnreadCount,
    markAllRead: markAllReadServer,
    clearAllServerNotifications,
    selectedTxForSheet,
    setSelectedTxForSheet,
    openTxDetailsByHash,
  } = useNotifications();

  const totalUnreadCount = localUnreadCount + serverUnreadCount;

  // Auto tandai terbaca setelah 1 detik saat panel terbuka
  useEffect(() => {
    let timer: number | null = null;
    if (isOpen && totalUnreadCount > 0) {
      timer = window.setTimeout(() => {
        markAllReadLocal();
        markAllReadServer();
      }, 1000);
    }
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [isOpen, totalUnreadCount, markAllReadLocal, markAllReadServer]);

  // Gabungkan item server + toast lokal, urutkan created_at desc, dedupe
  const unifiedList = React.useMemo(() => {
    const list: UnifiedNotification[] = [];
    const seenHashes = new Set<string>();

    // 1. Process server items first
    for (const item of serverItems) {
      if (item.tx_hash) {
        seenHashes.add(item.tx_hash.toLowerCase());
      }

      let message = '';
      const formattedAmount = fmt.asset(item.data.amount, item.data.asset);
      const rawCp = (item.data.counterparty || (item.data as any).to_address || '').replace(/^@+/, '').trim();
      const isExt = !rawCp || rawCp.startsWith('0x') || Boolean((item.data as any).is_external);
      const cpLabel = isExt
        ? (rawCp
            ? `${shortenAddress(rawCp)} (${t.history.externalWallet})`
            : t.history.externalWallet)
        : `@${rawCp}`;

      if (item.kind === 'tx_received') {
        message = t.notifications.kinds.tx_received
          .replace('{amount}', formattedAmount)
          .replace('{asset}', item.data.asset)
          .replace('@{counterparty}', cpLabel)
          .replace('{counterparty}', cpLabel);
      } else if (item.kind === 'tx_sent') {
        message = t.notifications.kinds.tx_sent
          .replace('{amount}', formattedAmount)
          .replace('{asset}', item.data.asset)
          .replace('@{counterparty}', cpLabel)
          .replace('{counterparty}', cpLabel);
      } else if (item.kind === 'tx_failed') {
        message = t.notifications.kinds.tx_failed
          .replace('@{counterparty}', cpLabel)
          .replace('{counterparty}', cpLabel);
      } else {
        message = `${formattedAmount} ${item.data.asset}`;
      }

      const title =
        item.kind === 'tx_received'
          ? (lang === 'id' ? 'Transfer Masuk' : 'Incoming Transfer')
          : item.kind === 'tx_sent'
          ? (lang === 'id' ? 'Transfer Terkirim' : 'Outgoing Transfer')
          : (lang === 'id' ? 'Transfer Gagal' : 'Transfer Failed');

      list.push({
        id: `server-${item.id}`,
        source: 'server',
        kind: item.kind,
        title,
        message,
        created_at: item.created_at,
        read: item.read,
        tx_hash: item.tx_hash,
        serverItem: item,
      });
    }

    // 2. Process local toast logs
    for (const item of localNotifications) {
      // Re-translate if messageKey is present
      let message = item.message;
      if (item.messageKey && (t.toast as any)[item.messageKey]) {
        let tmpl = (t.toast as any)[item.messageKey];
        if (item.messageParams) {
          Object.entries(item.messageParams).forEach(([k, v]) => {
            tmpl = tmpl.replace(`{${k}}`, v);
          });
        }
        message = tmpl;
      }

      const title =
        item.kind === 'success'
          ? (lang === 'id' ? 'Berhasil' : 'Success')
          : item.kind === 'error'
          ? (lang === 'id' ? 'Gagal' : 'Error')
          : item.kind === 'warning'
          ? (lang === 'id' ? 'Peringatan' : 'Warning')
          : (lang === 'id' ? 'Informasi' : 'Info');

      list.push({
        id: `local-${item.id}`,
        source: 'local',
        kind: item.kind,
        title,
        message,
        created_at: item.created_at,
        read: item.read,
      });
    }

    // Sort created_at descending
    list.sort((a, b) => {
      const timeA = new Date(a.created_at).getTime() || 0;
      const timeB = new Date(b.created_at).getTime() || 0;
      return timeB - timeA;
    });

    return list;
  }, [serverItems, localNotifications, t, lang]);

  const handleClearAll = () => {
    clearAllLocal();
    clearAllServerNotifications();
  };

  const handleItemClick = (item: UnifiedNotification) => {
    if (item.tx_hash) {
      openTxDetailsByHash(item.tx_hash);
    }
  };

  return (
    <>
      <BottomSheet
        open={isOpen}
        onClose={onClose}
        title={t.notifications.title}
        contentClassName="overflow-y-auto px-5 pt-0 sheet-body-pad"
      >
        <div className="select-none">
          {unifiedList.length > 0 && (
            <div className="flex items-center justify-between pb-3 pt-1 border-b border-[#E5E7EB] gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#5B6577] font-medium">
                  {unifiedList.length} {t.notifications.title.toLowerCase()}
                </span>
                {totalUnreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-[#EEF4FF] text-[#0052FF] text-[11px] font-semibold">
                    {t.notifications.unreadCount.replace('{count}', String(totalUnreadCount))}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC2626] hover:text-[#B91C1C] hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                aria-label={t.notifications.clearAll}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.notifications.clearAll}</span>
              </button>
            </div>
          )}

          {unifiedList.length === 0 ? (
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
              {unifiedList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`w-full text-left flex items-start gap-3 py-3 px-2 rounded-xl transition-all ${
                    item.tx_hash ? 'cursor-pointer hover:bg-[#F3F4F6]/80' : ''
                  } ${!item.read ? 'bg-[#F0F5FF]/60' : ''}`}
                >
                  {/* Unread indicator dot */}
                  <div className="pt-2 flex items-center justify-center w-2 shrink-0">
                    {!item.read ? (
                      <span className="w-2 h-2 rounded-full bg-[#0052FF] ring-2 ring-[#BFDBFE]" />
                    ) : (
                      <span className="w-2 h-2" />
                    )}
                  </div>

                  {/* Icon per kind */}
                  <NotificationTypeIcon kind={item.kind} />

                  {/* Title, message & Relative timestamp */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <p
                        className={`text-xs ${
                          !item.read ? 'font-bold text-[#0A0B0D]' : 'font-medium text-[#5B6577]'
                        }`}
                      >
                        {item.title}
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* TxDetailsSheet when item tapped */}
      <TxDetailsSheet
        open={selectedTxForSheet !== null}
        onClose={() => setSelectedTxForSheet(null)}
        tx={selectedTxForSheet}
      />
    </>
  );
}
