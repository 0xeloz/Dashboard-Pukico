import React, { useState } from 'react';
import {
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { useT } from '../../i18n';
import { formatChecksum, chunkAddress, diffChunks } from '../../lib/addressSafety';
import { formatRelativeTime } from '../../lib/formatters';

export interface RecipientVerificationProps {
  recipientId?: string | null;
  rawAddress: string;
  addressChanged?: boolean;
  previousAddress?: string | null;
  lastSentAt?: string | null;
  isAddressChangeAcknowledged?: boolean;
  onAcknowledgeChange?: (acknowledged: boolean) => void;
  lookalikeId?: string | null;
  onCopyAddress?: (text: string) => void;
}

export function RecipientVerification({
  recipientId = null,
  rawAddress,
  addressChanged = false,
  previousAddress = null,
  lastSentAt = null,
  isAddressChangeAcknowledged = false,
  onAcknowledgeChange,
  lookalikeId = null,
  onCopyAddress,
}: RecipientVerificationProps) {
  const { t, lang } = useT();
  const [copied, setCopied] = useState<boolean>(false);

  const checksumAddress = formatChecksum(rawAddress);
  const chunks = chunkAddress(checksumAddress);
  const basescanUrl = `https://sepolia.basescan.org/address/${checksumAddress}`;

  const handleCopy = () => {
    if (!checksumAddress) return;
    if (onCopyAddress) {
      onCopyAddress(checksumAddress);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(checksumAddress).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Compute diff if address changed
  const diffResult =
    addressChanged && previousAddress
      ? diffChunks(previousAddress, checksumAddress)
      : null;

  return (
    <div className="space-y-3">
      {/* 1. LOOKALIKE WARNING BANNER (Amber) */}
      {lookalikeId && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-[#B45309] flex items-start gap-2.5 animate-fade-up"
        >
          <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 leading-relaxed">
            <span className="font-semibold block text-[#92400E] mb-0.5">
              {t.sheets.send.newRecipientWarning}
            </span>
            <span>
              {t.sheets.send.lookalikeWarning.replace('{similarId}', lookalikeId)}
            </span>
          </div>
        </div>
      )}

      {/* 2. ADDRESS CHANGED BANNER (Red with Diff & Acknowledgment Checkbox) */}
      {addressChanged && previousAddress && (
        <div
          role="alert"
          className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-[#991B1B] space-y-3 animate-fade-up"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0 flex-1">
              <h4 className="font-bold text-sm text-[#991B1B]">
                {t.sheets.send.addressChangedTitle}
              </h4>
              <p className="text-[#B91C1C] leading-relaxed">
                {t.sheets.send.addressChangedDesc.replace('{id}', recipientId || '')}
              </p>
              {lastSentAt && (
                <p className="text-[11px] text-[#DC2626] font-medium">
                  {t.sheets.send.addressChangedLastSent.replace(
                    '{date}',
                    formatRelativeTime(lastSentAt, lang)
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Side-by-side or stacked diff comparison */}
          {diffResult && (
            <div className="space-y-2 pt-1">
              {/* Previous Address */}
              <div className="p-2.5 rounded-xl bg-white/90 border border-red-200/80 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#991B1B]">
                  {t.sheets.send.previousAddressLabel}
                </span>
                <div className="font-mono text-[11px] text-[#0A0B0D] break-all leading-relaxed select-all">
                  <span className="text-[#6B7280]">0x</span>
                  {diffResult.oldChunks.map((chunk, cIdx) => (
                    <span key={cIdx} className="inline-block mr-1">
                      {chunk.chars.map((charObj, chIdx) => (
                        <span
                          key={chIdx}
                          className={
                            charObj.isDiff
                              ? 'bg-red-200 text-red-950 font-bold px-0.5 rounded'
                              : 'text-[#4B5563]'
                          }
                        >
                          {charObj.char}
                        </span>
                      ))}
                    </span>
                  ))}
                </div>
              </div>

              {/* New Address */}
              <div className="p-2.5 rounded-xl bg-white/90 border border-red-300 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#047857]">
                  {t.sheets.send.newAddressLabel}
                </span>
                <div className="font-mono text-[11px] text-[#0A0B0D] break-all leading-relaxed select-all">
                  <span className="text-[#6B7280]">0x</span>
                  {diffResult.newChunks.map((chunk, cIdx) => (
                    <span key={cIdx} className="inline-block mr-1">
                      {chunk.chars.map((charObj, chIdx) => (
                        <span
                          key={chIdx}
                          className={
                            charObj.isDiff
                              ? 'bg-amber-200 text-amber-950 font-bold px-0.5 rounded'
                              : 'text-[#111827] font-semibold'
                          }
                        >
                          {charObj.char}
                        </span>
                      ))}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Acknowledgment Checkbox */}
          <div className="pt-1 border-t border-red-200">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAddressChangeAcknowledged}
                onChange={(e) => onAcknowledgeChange?.(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-red-300 text-[#0052FF] focus:ring-[#0052FF] cursor-pointer"
              />
              <span className="text-xs font-semibold text-[#0A0B0D] leading-tight">
                {t.sheets.send.addressChangeAcknowledge}
              </span>
            </label>
          </div>
        </div>
      )}

      {/* 3. FULL RECIPIENT CHECKSUM ADDRESS (ALWAYS VISIBLE) */}
      <div className="p-3.5 rounded-2xl bg-white border border-[#E5E7EB] space-y-2.5 text-xs shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[#0A0B0D] font-semibold">
            <ShieldCheck className="w-4 h-4 text-[#0052FF]" />
            <span>{t.sheets.send.recipientAddress}</span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-[#F3F4F6] text-[#0052FF] font-medium text-[11px] transition-colors cursor-pointer"
            aria-label={t.common.copyAddress}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#047857]" />
                <span className="text-[#047857]">{t.common.copied}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{t.common.copy}</span>
              </>
            )}
          </button>
        </div>

        {/* 4-character chunks display with 6 prefix chars & 4 suffix chars bolded */}
        <div
          onClick={handleCopy}
          title={t.common.copyAddress}
          className="font-mono text-[11px] tracking-wide bg-[#F9FAFB] hover:bg-[#F3F4F6] transition-colors p-2.5 rounded-xl border border-[#E5E7EB] flex flex-wrap gap-x-1.5 gap-y-1 items-center select-all cursor-pointer leading-relaxed"
        >
          <span className="text-[#5B6577] font-semibold">0x</span>
          {chunks.map((chunk, index) => {
            // Address hex characters after 0x are indices 0..39 across 10 chunks of 4.
            // Requirement: 6 characters after "0x" (indices 0..5) and 4 last characters (indices 36..39) are bold!
            return (
              <span key={index} className="inline-flex">
                {chunk.split('').map((char, charIdx) => {
                  const globalIndex = index * 4 + charIdx;
                  const isPrefixBold = globalIndex < 6; // First 6 chars after 0x
                  const isSuffixBold = globalIndex >= 36; // Last 4 chars

                  const isBold = isPrefixBold || isSuffixBold;

                  return (
                    <span
                      key={charIdx}
                      className={
                        isBold
                          ? 'font-bold text-[#0A0B0D]'
                          : 'font-normal text-[#5B6577]'
                      }
                    >
                      {char}
                    </span>
                  );
                })}
              </span>
            );
          })}
        </div>

        {/* Link to BaseScan */}
        <div className="flex items-center justify-between pt-0.5 text-[11px]">
          {recipientId ? (
            <span className="text-[#5B6577] font-mono">@{recipientId.replace(/^@+/, '')}</span>
          ) : (
            <span className="text-[#5B6577]">Base Sepolia</span>
          )}
          <a
            href={basescanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#0052FF] hover:underline font-medium cursor-pointer"
          >
            <span>{t.sheets.send.viewOnBasescan}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
