import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useBalance } from '../../../context/BalanceContext';
import { useT } from '../../../i18n';
import { UsdcTokenIcon } from '../../ui/PukicoBrand';
import type { UserProfile } from '../../../types';

export { SendSheetContent } from './SendSheetContent';

interface ReceiveSheetContentProps {
  profile: UserProfile;
  isDemoMode: boolean;
  onClose?: () => void;
}

export function ReceiveSheetContent({ profile, isDemoMode, onClose }: ReceiveSheetContentProps) {
  const { t } = useT();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const formattedPukicoId = profile.pukico_id
    ? `@${profile.pukico_id.replace(/^@/, '')}`
    : '';

  useEffect(() => {
    if (profile.wallet_address) {
      QRCode.toDataURL(profile.wallet_address, {
        width: 200,
        margin: 0,
        color: {
          dark: '#0A0B0D',
          light: '#FFFFFF',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code generation failed:', err));
    }
  }, [profile.wallet_address]);

  const handleCopy = async (text: string, type: 'address' | 'id') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }

    if (type === 'address') {
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 1500);
    } else {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    }
  };

  return (
    <div className="space-y-4 text-center">
      {/* Network & Demo chip */}
      <div className="flex items-center justify-center gap-2">
        <span className="px-2.5 py-1 rounded-full bg-[#EEF4FF] text-[#0052FF] text-xs font-semibold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0052FF]" />
          {t.common.baseSepolia} · {t.common.testnet}
        </span>
        {isDemoMode && (
          <span className="px-2 py-0.5 rounded-full bg-[#FFFBEB] text-[#B45309] text-[11px] font-bold border border-[#FDE68A]">
            {t.common.demoData}
          </span>
        )}
      </div>

      {/* QR Code Flat */}
      <div className="flex justify-center my-3">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={t.sheets.receive.baseSepoliaWalletQr}
            width={200}
            height={200}
            className="w-[200px] h-[200px] block"
          />
        ) : (
          <div className="w-[200px] h-[200px] flex items-center justify-center text-xs text-[#5B6577]">
            {t.sheets.receive.generatingQr}
          </div>
        )}
      </div>

      {/* Pukico ID Row - only if pukico_id exists */}
      {formattedPukicoId && (
        <div className="py-2.5 border-b border-[#E5E7EB] flex items-center justify-between text-left">
          <div>
            <div className="text-[11px] font-medium text-[#5B6577]">{t.sheets.receive.pukicoId}</div>
            <div className="font-mono text-sm font-bold text-[#0A0B0D]">{formattedPukicoId}</div>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(formattedPukicoId, 'id')}
            className="px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-medium text-[#0A0B0D] flex items-center gap-1.5 transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
          >
            {copiedId ? (
              <span className="inline-flex items-center gap-1 text-[#047857] transition-opacity duration-150">
                <Check className="w-3.5 h-3.5" />
                <span>{t.common.copied}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 transition-opacity duration-150">
                <Copy className="w-3.5 h-3.5" />
                <span>{t.common.copyId}</span>
              </span>
            )}
          </button>
        </div>
      )}

      {/* Wallet address row with Copy button */}
      <div className="py-2.5 border-b border-[#E5E7EB] text-left">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-[#5B6577]">{t.sheets.receive.walletAddress}</span>
            {(isDemoMode || profile.wallet_address === '0x1111111111111111111111111111111111111111') && (
              <span className="text-[10px] font-semibold text-[#B45309] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]">
                {t.common.exampleAddress}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleCopy(profile.wallet_address, 'address')}
            className="px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-medium text-[#0A0B0D] flex items-center gap-1.5 transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
          >
            {copiedAddress ? (
              <span className="inline-flex items-center gap-1 text-[#047857] transition-opacity duration-150">
                <Check className="w-3.5 h-3.5" />
                <span>{t.common.copied}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 transition-opacity duration-150">
                <Copy className="w-3.5 h-3.5" />
                <span>{t.common.copyAddress}</span>
              </span>
            )}
          </button>
        </div>
        <div className="font-mono text-xs text-[#0A0B0D] break-all select-all font-semibold leading-relaxed">
          {profile.wallet_address}
        </div>
      </div>

      {/* Amber warning */}
      <div className="pt-1 text-left flex items-start gap-2 text-xs text-[#B45309]">
        <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          {t.sheets.receive.warningShort}
        </p>
      </div>

      {/* Done button */}
      {onClose && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-[#0052FF] hover:bg-[#0042D6] text-white transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
          >
            {t.common.done}
          </button>
        </div>
      )}
    </div>
  );
}

interface FaucetSheetContentProps {
  walletAddress: string;
  onRefreshBalance?: () => Promise<void> | void;
  isRefreshing?: boolean;
  isDemoMode?: boolean;
  onClose?: () => void;
}

export function FaucetSheetContent({
  walletAddress,
  onRefreshBalance,
  isRefreshing,
  isDemoMode = false,
  onClose,
}: FaucetSheetContentProps) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  const balanceCtx = useBalance();
  const handleRefresh = onRefreshBalance ?? balanceCtx.refresh;
  const isRefreshingActive = isRefreshing ?? balanceCtx.refreshing;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const input = document.createElement('input');
      input.value = walletAddress;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="space-y-4">
      {/* Langkah 1: Copy your address */}
      <div className="py-2.5 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold shrink-0">
            1
          </span>
          <span className="text-sm font-semibold text-[#0A0B0D]">{t.sheets.faucet.step1Title}</span>
          {(isDemoMode || walletAddress === '0x1111111111111111111111111111111111111111') && (
            <span className="text-[10px] font-semibold text-[#B45309] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]">
              {t.common.exampleAddress}
            </span>
          )}
        </div>
        <div className="font-mono text-xs text-[#0A0B0D] break-all py-1 select-all font-medium">
          {walletAddress}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-1.5 py-1.5 px-3 rounded-lg border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-semibold text-[#0A0B0D] flex items-center justify-center gap-1.5 transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
        >
          {copied ? (
            <span className="inline-flex items-center gap-1.5 text-[#047857] transition-opacity duration-150">
              <Check className="w-3.5 h-3.5" />
              <span>{t.common.copied}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 transition-opacity duration-150">
              <Copy className="w-3.5 h-3.5" />
              <span>{t.common.copyAddress}</span>
            </span>
          )}
        </button>
      </div>

      {/* Langkah 2: Open Circle Faucet */}
      <div className="py-2.5 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold shrink-0">
            2
          </span>
          <span className="text-sm font-semibold text-[#0A0B0D]">
            {t.sheets.faucet.step2Title}
          </span>
        </div>
        <p className="text-xs text-[#5B6577] mb-2.5">
          {t.sheets.faucet.step2Desc}
        </p>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-[#0052FF] hover:bg-[#0042D6] text-white text-xs font-semibold transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
        >
          <UsdcTokenIcon className="w-4 h-4" />
          <span>{t.sheets.faucet.openFaucet}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Langkah 3: Come back and refresh */}
      <div className="py-2.5 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold shrink-0">
            3
          </span>
          <span className="text-sm font-semibold text-[#0A0B0D]">{t.sheets.faucet.step3Title}</span>
        </div>
        <p className="text-xs text-[#5B6577] mb-2.5">
          {t.sheets.faucet.step3Desc}
        </p>
        <button
          type="button"
          onClick={() => handleRefresh()}
          disabled={isRefreshingActive}
          className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-semibold text-[#0052FF] transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingActive ? 'animate-spin' : ''}`} />
          <span>{isRefreshingActive ? t.sheets.faucet.updatingBalance : t.sheets.faucet.refreshBalance}</span>
        </button>
      </div>

      {/* Catatan ETH */}
      <p className="text-xs text-[#5B6577] leading-relaxed pt-1">
        {t.sheets.faucet.ethNote}
      </p>

      {/* Done button */}
      {onClose && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-white border border-[#E5E7EB] hover:bg-[#EEF4FF] text-[#0A0B0D] transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
          >
            {t.common.done}
          </button>
        </div>
      )}
    </div>
  );
}

