import React, { useState } from 'react';
import { ExternalLink, Copy, Check, Clock, CheckCircle2, XCircle, Loader2, Share2 } from 'lucide-react';
import { parseUnits } from 'viem';
import { BottomSheet } from './BottomSheet';
import { useT } from '../../i18n';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useTx } from '../../context/TxContext';
import { formatFullDateTime } from '../../lib/formatters';
import { shortenAddress, getExplorerUrl, type TxRecord } from '../../lib/txApi';
import { retryFeePayment } from '../../lib/feeRetry';
import { renderReceiptPng } from '../../lib/receiptImage';

function safeParseUnits(val: string | null | undefined, decimals: number): bigint {
  if (!val) return 0n;
  const clean = String(val).replace(/,/g, '').replace(/[^0-9.]/g, '').trim();
  if (!clean) return 0n;
  const parts = clean.split('.');
  const sanitized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : clean;
  try {
    return parseUnits(sanitized, decimals);
  } catch {
    return 0n;
  }
}

interface TxDetailsSheetProps {
  open: boolean;
  onClose: () => void;
  tx: TxRecord | null;
}

export function TxDetailsSheet({ open, onClose, tx }: TxDetailsSheetProps) {
  const { t, lang, fmt } = useT();
  const { toast } = useToast();
  const { profile, isDemoMode, sendTransaction, getAccessToken } = useAuth();
  const { txs, refresh, updateTxRecord } = useTx();

  const [copied, setCopied] = useState(false);
  const [isPayingFee, setIsPayingFee] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  if (!tx) return null;

  // Track the most up-to-date record from TxContext if available
  const currentTx =
    txs.find((item) => item.tx_hash.toLowerCase() === tx.tx_hash.toLowerCase()) || tx;

  const isIncoming = currentTx.direction === 'in' || currentTx.direction === 'incoming';
  const isOutgoing = !isIncoming;

  const rawStatus = (currentTx.status || 'confirmed').toLowerCase();
  const isPending = rawStatus === 'pending';
  const isFailed = rawStatus === 'failed';
  const isConfirmed = !isPending && !isFailed;

  const counterparty = (
    currentTx.counterparty ||
    currentTx.to_pukico_id ||
    currentTx.from_pukico_id ||
    ''
  ).replace(/^@/, '');

  const formattedAmount = fmt.asset(currentTx.amount, currentTx.asset);
  const explorerUrl =
    currentTx.explorer_url || (currentTx.tx_hash ? getExplorerUrl(currentTx.tx_hash) : '');

  const handleCopyHash = async () => {
    if (!currentTx.tx_hash) return;
    try {
      await navigator.clipboard.writeText(currentTx.tx_hash);
      setCopied(true);
      toast.info(t.toast.copiedHash, { silent: true });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const input = document.createElement('input');
      input.value = currentTx.tx_hash;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      toast.info(t.toast.copiedHash, { silent: true });
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Determine whether to display the service fee row
  // Sembunyikan untuk transaksi masuk, atau jika status 'none' / 'legacy', atau jika tidak ada fee info
  const isFeeHidden =
    isIncoming ||
    currentTx.fee_status === 'none' ||
    currentTx.fee_status === 'legacy' ||
    (!currentTx.service_fee && currentTx.fee_status !== 'pending' && !currentTx.fee_tx_hash);

  const canPayFee =
    isOutgoing &&
    (currentTx.fee_status === 'unpaid' || currentTx.fee_status === 'invalid');

  const handlePayFee = async () => {
    if (isPayingFee) return;
    setIsPayingFee(true);
    toast.loading(t.toast.feePaying, { id: 'retry-fee-status', title: t.toast.feePaying });

    try {
      const res = await retryFeePayment({
        tx: currentTx,
        walletAddress: profile?.wallet_address || '',
        isDemoMode,
        sendTransaction,
        getAccessToken,
      });

      if (res.ok && res.feeTxHash) {
        toast.update('retry-fee-status', 'success', t.toast.feePaid, {
          silent: true,
          title: t.history.serviceFee,
        });
        toast.removeStoredNotification(`fee-failed:${currentTx.tx_hash}`);
        // Update local context immediately for instant feedback
        updateTxRecord(currentTx.tx_hash, {
          fee_status: 'paid',
          fee_tx_hash: res.feeTxHash,
        });
        await refresh();
      } else if (res.error === 'user_rejected') {
        toast.update('retry-fee-status', 'info', t.toast.sendCancelled, {
          title: t.history.serviceFee,
        });
      } else if (res.error === 'insufficient_eth') {
        toast.update('retry-fee-status', 'warning', t.toast.feeInsufficientEth, {
          silent: true,
          title: t.history.serviceFee,
        });
      } else {
        toast.update('retry-fee-status', 'error', t.toast.feeFailed, {
          silent: true,
          title: t.history.serviceFee,
        });
      }
    } catch {
      toast.update('retry-fee-status', 'error', t.toast.feeFailed, {
        silent: true,
        title: t.history.serviceFee,
      });
    } finally {
      setIsPayingFee(false);
    }
  };

  const renderFeeStatusBadge = (status?: string | null) => {
    if (!status) return null;
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#ECFDF5] text-[#047857]">
            {t.history.feeStatusPaid}
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F3F4F6] text-[#5B6577]">
            {t.history.feeStatusPending}
          </span>
        );
      case 'unpaid':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FFFBEB] text-[#B45309]">
            {t.history.feeStatusUnpaid}
          </span>
        );
      case 'invalid':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF2F2] text-[#B91C1C]">
            {t.history.feeStatusInvalid}
          </span>
        );
      default:
        return null;
    }
  };

  const formattedServiceFee = currentTx.service_fee
    ? currentTx.asset === 'USDC'
      ? `${fmt.usdcString(currentTx.service_fee)} USDC`
      : `${fmt.ethBalance(currentTx.service_fee)} ETH`
    : null;

  const hasServiceFee =
    isOutgoing &&
    currentTx.fee_status !== 'none' &&
    currentTx.fee_status !== 'legacy' &&
    Boolean(currentTx.service_fee);

  const totalFromYouFormatted = (() => {
    if (!hasServiceFee || !currentTx.service_fee) return null;
    const decimals = currentTx.asset === 'USDC' ? 6 : 18;
    const amtUnits = safeParseUnits(currentTx.amount, decimals);
    const feeUnits = safeParseUnits(currentTx.service_fee, decimals);
    const totUnits = amtUnits + feeUnits;
    if (totUnits <= 0n) return null;
    if (currentTx.asset === 'USDC') {
      return `${fmt.usdcUnits(totUnits)} USDC`;
    }
    return `${fmt.ethBalance(totUnits)} ETH`;
  })();

  const myPukicoId = (profile?.pukico_id || '').replace(/^@+/, '').trim();
  const rawCounterparty = (
    currentTx.counterparty ||
    (isIncoming ? currentTx.from_pukico_id : currentTx.to_pukico_id) ||
    ''
  ).replace(/^@+/, '').trim();

  const senderId = isIncoming ? (rawCounterparty || '—') : (myPukicoId || 'you');
  const recipientId = isIncoming ? (myPukicoId || 'you') : (rawCounterparty || '—');
  const cleanNominal = `${formattedAmount} ${currentTx.asset}`;
  const formattedTime = currentTx.created_at ? formatFullDateTime(currentTx.created_at, lang) : '';
  const networkName = t.history.networkValue || 'Base Sepolia · Testnet';

  const teksRingkas =
    lang === 'id'
      ? `Pukico — ${t.history.receiptTitle}\n${cleanNominal} dari @${senderId} ke @${recipientId}\n${formattedTime}\nStatus: ${t.history.receiptStatusConfirmed}\n${networkName}${explorerUrl ? `\n${explorerUrl}` : ''}`
      : `Pukico — ${t.history.receiptTitle}\n${cleanNominal} from @${senderId} to @${recipientId}\n${formattedTime}\nStatus: ${t.history.receiptStatusConfirmed}\n${networkName}${explorerUrl ? `\n${explorerUrl}` : ''}`;

  const handleShareReceipt = async () => {
    if (isSharing || !isConfirmed) return;
    setIsSharing(true);

    try {
      const networkFeeFormatted = currentTx.network_fee_wei
        ? `${fmt.ethFee(currentTx.network_fee_wei)} ETH`
        : null;

      const blob = await renderReceiptPng({
        lang,
        nominal: cleanNominal,
        senderId,
        recipientId,
        timeStr: formattedTime,
        networkName,
        statusLabel: t.history.receiptStatusConfirmed,
        txHashShort: currentTx.tx_hash ? shortenAddress(currentTx.tx_hash) : '',
        isOutgoing,
        amountFormatted: `${formattedAmount} ${currentTx.asset}`,
        serviceFeeFormatted: formattedServiceFee,
        totalFromYouFormatted,
        networkFeeFormatted,
        labels: {
          receiptTitle: t.history.receiptTitle,
          from: t.history.from,
          to: t.history.to,
          time: t.history.time,
          network: t.history.network,
          amount: t.history.amount,
          serviceFee: t.history.serviceFee,
          totalFromYou: t.history.totalFromYou,
          networkFee: t.sheets.send.networkFee,
          hash: t.history.hash,
          footer: t.history.receiptFooter,
        },
      });

      const fileName = `pukico-receipt-${(currentTx.tx_hash || 'tx').slice(2, 10)}.png`;
      let file: File | null = null;
      try {
        file = new File([blob], fileName, { type: 'image/png' });
      } catch {
        file = null;
      }

      // 5b. If navigator.canShare({ files: [file] }) is true
      if (
        file &&
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] }) &&
        typeof navigator.share === 'function'
      ) {
        try {
          await navigator.share({
            files: [file],
            title: 'Pukico',
            text: teksRingkas,
          });
          return;
        } catch (shareErr: unknown) {
          if ((shareErr as Error)?.name === 'AbortError') {
            return;
          }
        }
      }

      // 5c. If files not supported but navigator.share exists
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          const shareTextWithUrl = explorerUrl ? `${teksRingkas}\n${explorerUrl}` : teksRingkas;
          await navigator.share({
            title: 'Pukico',
            text: shareTextWithUrl,
            url: explorerUrl || undefined,
          });
          return;
        } catch (shareErr: unknown) {
          if ((shareErr as Error)?.name === 'AbortError') {
            return;
          }
        }
      }

      // 5d. Fallback: Copy to clipboard or download file
      let copiedToClipboard = false;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(teksRingkas);
          copiedToClipboard = true;
          toast.info(t.history.receiptCopied, { silent: true });
        } catch {
          copiedToClipboard = false;
        }
      }

      if (!copiedToClipboard) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.info(t.history.receiptCopied, { silent: true });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error('[share-receipt]', err);
      }
    } finally {
      setIsSharing(false);
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
            {isIncoming ? `+${formattedAmount}` : `-${formattedAmount}`} {currentTx.asset}
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
              {isIncoming ? `+${formattedAmount}` : `-${formattedAmount}`} {currentTx.asset}
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
          {currentTx.created_at && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[#5B6577] font-medium">{t.history.time}</span>
              <span className="text-sm text-[#0A0B0D]">
                {formatFullDateTime(currentTx.created_at, lang)}
              </span>
            </div>
          )}

          {/* 5. Network */}
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-[#5B6577] font-medium">{t.history.network}</span>
            <span className="text-sm font-semibold text-[#0A0B0D]">
              {networkName}
            </span>
          </div>

          {/* 6. Hash */}
          {currentTx.tx_hash && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[#5B6577] font-medium">{t.history.hash}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#0A0B0D] select-all">
                  {shortenAddress(currentTx.tx_hash)}
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

          {/* 7. Network Fee */}
          {currentTx.network_fee_wei && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[#5B6577] font-medium">{t.sheets.send.networkFee}</span>
              <span className="font-mono text-sm font-semibold text-[#0A0B0D]">
                {fmt.ethFee(currentTx.network_fee_wei)} ETH
              </span>
            </div>
          )}

          {/* 8. Service Fee (HANYA UNTUK TRANSAKSI KELUAR) */}
          {!isFeeHidden && (
            <div className="py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#5B6577] font-medium">
                  {t.history.serviceFee}
                </span>
                <div className="flex items-center gap-2">
                  {formattedServiceFee && (
                    <span className="font-mono text-sm font-semibold text-[#0A0B0D]">
                      {formattedServiceFee}
                    </span>
                  )}
                  {renderFeeStatusBadge(currentTx.fee_status)}
                </div>
              </div>

              {/* Tautan hash fee ke Basescan */}
              {currentTx.fee_tx_hash && (
                <div className="flex items-center justify-between text-xs text-[#5B6577] pt-0.5">
                  <span className="text-[11px]">Fee Tx Hash</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-[#0A0B0D] select-all">
                      {shortenAddress(currentTx.fee_tx_hash)}
                    </span>
                    <a
                      href={getExplorerUrl(currentTx.fee_tx_hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-0.5 rounded text-[#5B6577] hover:text-[#0052FF]"
                      title={t.sheets.send.viewOnBasescan}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {/* Tombol Bayar Sekarang (hanya jika fee_status 'unpaid' atau 'invalid' pada transaksi keluar) */}
              {canPayFee && (
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isPayingFee}
                    onClick={handlePayFee}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#0052FF] hover:bg-[#0042D6] active:scale-[0.98] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-sm"
                  >
                    {isPayingFee ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{t.history.payingFee}</span>
                      </>
                    ) : (
                      <span>{t.history.payFeeNow}</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 9. Total dari kamu (HANYA UNTUK TRANSAKSI KELUAR DENGAN SERVICE FEE) */}
          {totalFromYouFormatted && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[#5B6577] font-medium">
                {t.history.totalFromYou}
              </span>
              <span className="font-mono text-sm font-bold text-[#0052FF] tabular-nums">
                {totalFromYouFormatted}
              </span>
            </div>
          )}
        </div>

        {/* 10. Explorer link */}
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

        {/* 11. Share Receipt Button */}
        <div className="pt-1">
          <button
            type="button"
            disabled={!isConfirmed || isSharing}
            onClick={handleShareReceipt}
            aria-label={t.history.shareReceipt}
            className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
              isConfirmed && !isSharing
                ? 'border border-[#0052FF] text-[#0052FF] hover:bg-[#EEF4FF] active:scale-[0.98] cursor-pointer bg-white'
                : 'border border-[#E5E7EB] text-[#9CA3AF] bg-[#F9FAFB] cursor-not-allowed'
            }`}
          >
            {isSharing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#0052FF]" />
                <span className="text-[#0052FF]">{t.history.shareReceipt}</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>{t.history.shareReceipt}</span>
              </>
            )}
          </button>
          {!isConfirmed && (
            <p className="text-xs text-[#9CA3AF] text-center mt-1.5 leading-relaxed">
              {t.history.receiptReady}
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
