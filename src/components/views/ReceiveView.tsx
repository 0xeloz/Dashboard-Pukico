import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Copy, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useT } from '../../i18n';
import { CHAIN_CONFIG } from '../../lib/config';
import { useToast } from '../../context/ToastContext';

interface ReceiveViewProps {
  walletAddress: string;
  onBack: () => void;
  isDemoMode?: boolean;
}

export function ReceiveView({ walletAddress, onBack, isDemoMode = false }: ReceiveViewProps) {
  const { t } = useT();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (walletAddress) {
      QRCode.toDataURL(walletAddress, {
        width: 240,
        margin: 2,
        color: {
          dark: '#0A0B0D',
          light: '#FFFFFF',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Failed to generate QR:', err));
    }
  }, [walletAddress]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      toast.info(t.toast.copiedAddress, { silent: true });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const input = document.createElement('input');
      input.value = walletAddress;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      toast.info(t.toast.copiedAddress, { silent: true });
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="w-full max-w-[560px] mx-auto px-4 sm:px-6 py-2 space-y-5 animate-fade-up">
      {/* Top navigation */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-2xl border border-[#E5E7EB] bg-white text-[#3B4455] hover:text-[#0A0B0D] hover:bg-[#EEF4FF] flex items-center justify-center transition-transform duration-[var(--dur-tap)] active:scale-[0.97] cursor-pointer"
          aria-label={t.sheets.receive.backToHome}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#0A0B0D]">{t.sheets.receive.receiveAssets}</h1>
          <p className="text-xs text-[#5B6577]">{t.common.testnetBaseSepolia}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-4 text-center">
        {/* Network indicator chip */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EEF4FF] text-[#0052FF]">
          <span className="w-2 h-2 rounded-full bg-[#0052FF]" />
          <span className="text-xs font-semibold">{t.sheets.receive.networkPrefix} {CHAIN_CONFIG.name}</span>
          <span className="text-xs text-[#5B6577]">· ID {CHAIN_CONFIG.id}</span>
        </div>

        {/* QR Code Container */}
        <div className="flex justify-center my-3">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={t.sheets.receive.walletQrCode}
              className="w-48 h-48 sm:w-56 sm:h-56 mx-auto block"
            />
          ) : (
            <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center text-xs text-[#5B6577]">
              {t.sheets.receive.generatingQr}
            </div>
          )}
        </div>

        {/* Address and Copy */}
        <div className="py-3 border-b border-[#E5E7EB] text-left">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[#5B6577]">{t.sheets.receive.yourWalletAddress}</span>
              {(isDemoMode || walletAddress === '0x1111111111111111111111111111111111111111') && (
                <span className="text-[10px] font-semibold text-[#B45309] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]">
                  {t.common.exampleAddress}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-semibold text-[#0A0B0D] flex items-center gap-1.5 transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
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
          <div className="font-mono text-xs sm:text-sm text-[#0A0B0D] break-all select-all font-semibold leading-relaxed">
            {walletAddress}
          </div>
        </div>

        {/* Mandatory Warning */}
        <div className="pt-1 flex items-start gap-2.5 text-left text-xs text-[#B45309]">
          <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {t.sheets.receive.warningLong}
          </p>
        </div>

        {/* Testnet Faucet Note */}
        <div className="pt-2 flex items-center gap-2.5 text-left text-xs text-[#5B6577]">
          <ShieldCheck className="w-4 h-4 text-[#047857] shrink-0" />
          <p>
            {t.sheets.receive.needTestFunds}
          </p>
        </div>
      </div>
    </div>
  );
}

