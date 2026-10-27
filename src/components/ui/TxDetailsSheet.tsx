import React, { useState } from 'react';
import { ExternalLink, Copy, Check, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { useT } from '../../i18n';
import { useToast } from '../../context/ToastContext';
import { formatAssetAmount, formatFullDateTime, formatEthFee } from '../../lib/formatters';
import { shortenAddress, getExplorerUrl, type TxRecord } from '../../lib/txApi';

interface TxDetailsSheetProps {
  open: boolean;
  onClose: () => void;
  tx: TxRecord | null;
}

export function TxDetailsSheet({ open, onClose, tx }: TxDetailsSheetProps) {
  const { t, lang, fmt } = useT();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!tx) return null;

  const isIncoming = tx.direction === 'in' || tx.direction === 'incoming';
  const rawStatus = (tx.status || 'confirmed').toLowerCase();
  const isPending = rawStatus === 'pending';
  const isFailed = rawStatus === 'failed';
  const isConfirmed = !isPending && !isFailed;

  const counterparty = (tx.counterparty || tx.to_pukico_id || tx.from_pukico_id || '').replace(
    /^@/,
    ''
  );

  const formattedAmount = fmt.asset(tx.amount, tx.asset);
  const explorerUrl = tx.explorer_url || (tx.tx_hash ? getExplorerUrl(tx.tx_hash) : '');

  const handleCopyHash = async () => {
    if (!tx.tx_hash) return;
    try {
      await navigator.clipboard.writeText(tx.tx_hash);
      setCopied(true);
      toast.info(t.toast.copiedHash, { silent: true });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const input = document.createElement('input');
      input.value = tx.tx_hash;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      toast.info(t.toast.copiedHash, { silent: true });
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t.history.details}>
      <div className="space-y-4 pt-1 pb-4 text-left select-none">
        {/* Large Amount Display */}
        <div className="py-2 text-center">
          <div
            className={`font-mono text-2xl font-bold tracking-tight tabular-nums ${
              isIncoming ? 'text-[#047857]' : 'text-[#0A0B0D]'
            }`}
          >
            {isIncoming ? `+${formattedAmount}` : `-${formattedAmount}`} {tx.asset}
          </div>
          <div className="text-xs text-[#5B6577] mt-1">
            {isIncoming ? t.history.from : t.history.to} @{counterparty || '—'}
          </div>
        </div>

        {/* Flat Key-Value Details */}
        <div className="divide-y divide-[#E5E7EB] border-t border-b border-[#E5E7EB]">
          {/* 1. Status */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-[#5B6577] font-medium">{t.history.status}</span>
            <div className="flex items-center gap-1.5 font-medium text-sm">
              {isPending && (
                <>
                  <Clock className="w-4 h-4 text-[#B45309]" />
                  <span className="text-[#B45309]">{t.history.pending}</span>
                </>
              )}
              {isConfirmed && (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#5B6577]" />
                  <span className="text-[#5B6577]">{t.history.confirmed}</span>
                </>
              )}
              {isFailed && (
                <>
                  <XCircle className="w-4 h-4 text-[#B91C1C]" />
                  <span className="text-[#B91C1C]">{t.history.failed}</span>
                </>
              )}
            </div>
          </div>

          {/* 2. Amount */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-[#5B6577] font-medium">{t.history.amount}</span>
            <span className="font-mono text-sm font-semibold text-[#0A0B0D] tabular-nums">
              {isIncoming ? `+${formattedAmount}` : `-${formattedAmount}`} {tx.asset}
            </span>
          </div>

          {/* 3. Counterparty (To / From) */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-[#5B6577] font-medium">
              {isIncoming ? t.history.from : t.history.to}
            </span>
            <span className="font-mono text-sm font-semibold text-[#0A0B0D]">
              @{counterparty || '—'}
            </span>
          </div>

          {/* 4. Time */}
          {tx.created_at && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[#5B6577] font-medium">{t.history.time}</span>
              <span className="text-sm text-[#0A0B0D]">
                {formatFullDateTime(tx.created_at, lang)}
              </span>
            </div>
          )}

          {/* 5. Hash */}
          {tx.tx_hash && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[#5B6577] font-medium">{t.history.hash}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#0A0B0D] select-all">
                  {shortenAddress(tx.tx_hash)}
                </span>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="p-1 rounded-md text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6] transition-transform active:scale-[0.96] cursor-pointer"
                  aria-label={copied ? t.common.copied : t.common.copy}
                >
                  {copied ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#047857]">
                      <Check className="w-3.5 h-3.5" />
                      <span>{t.common.copied}</span>
                    </span>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* 6. Network Fee */}
          {tx.network_fee_wei && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[#5B6577] font-medium">{t.sheets.send.networkFee}</span>
              <span className="font-mono text-sm font-semibold text-[#0A0B0D]">
                {fmt.ethFee(tx.network_fee_wei)} ETH
              </span>
            </div>
          )}

          {/* 7. Service Fee */}
          {tx.fee_tx_hash && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[#5B6577] font-medium">{t.sheets.send.serviceFee}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#0A0B0D] select-all">
                  {shortenAddress(tx.fee_tx_hash)}
                </span>
                <a
                  href={getExplorerUrl(tx.fee_tx_hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded-md text-[#5B6577] hover:text-[#0052FF]"
                  title={t.sheets.send.viewOnBasescan}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* 6. Explorer link */}
        {explorerUrl && (
          <div className="pt-2">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold text-[#0052FF] hover:text-[#0042D6] active:bg-[#EEF4FF] rounded-xl transition-colors cursor-pointer"
            >
              <span>{t.history.viewOnBasescan}</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
