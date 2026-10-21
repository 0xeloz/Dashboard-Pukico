import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Copy, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { CHAIN_CONFIG } from '../../lib/config';

interface ReceiveViewProps {
  walletAddress: string;
  onBack: () => void;
  isDemoMode?: boolean;
}

export function ReceiveView({ walletAddress, onBack, isDemoMode = false }: ReceiveViewProps) {
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
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = walletAddress;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-[560px] mx-auto px-4 sm:px-6 py-2 space-y-5 animate-fade-up">
      {/* Top navigation */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-2xl border border-[#E5E7EB] bg-white text-[#3B4455] hover:text-[#0A0B0D] hover:bg-[#EEF4FF] flex items-center justify-center transition-all active:scale-[0.98] cursor-pointer"
          aria-label="Back to home"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#0A0B0D]">Receive Assets</h1>
          <p className="text-xs text-[#5B6577]">Base Sepolia Testnet</p>
        </div>
      </div>

      {/* Main Content (Datar langsung di latar #F7F8FA tanpa kartu, border keliling, atau shadow) */}
      <div className="space-y-4 text-center">
        {/* Network indicator chip */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EEF4FF] text-[#0052FF]">
          <span className="w-2 h-2 rounded-full bg-[#0052FF]" />
          <span className="text-xs font-semibold">Network: {CHAIN_CONFIG.name}</span>
          <span className="text-xs text-[#5B6577]">· ID {CHAIN_CONFIG.id}</span>
        </div>

        {/* QR Code Container - tanpa bingkai */}
        <div className="flex justify-center my-3">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Wallet QR Code"
              className="w-48 h-48 sm:w-56 sm:h-56 mx-auto block"
            />
          ) : (
            <div className="w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center text-xs text-[#5B6577]">
              Generating QR...
            </div>
          )}
        </div>

        {/* Address and Copy - teks monospace dengan tombol copy dan garis pemisah tipis */}
        <div className="py-3 border-b border-[#E5E7EB] text-left">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[#5B6577]">Your Wallet Address</span>
              {(isDemoMode || walletAddress === '0x1111111111111111111111111111111111111111') && (
                <span className="text-[10px] font-semibold text-[#B45309] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]">
                  Example address
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-semibold text-[#0A0B0D] flex items-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#047857]" />
                  <span className="text-[#047857]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Address</span>
                </>
              )}
            </button>
          </div>
          <div className="font-mono text-xs sm:text-sm text-[#0A0B0D] break-all select-all font-semibold leading-relaxed">
            {walletAddress}
          </div>
        </div>

        {/* Mandatory Warning - teks amber dengan ikon tanpa kotak berlatar */}
        <div className="pt-1 flex items-start gap-2.5 text-left text-xs text-[#B45309]">
          <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Only send Base Sepolia testnet assets (USDC, ETH) to this address. Sending mainnet funds or assets from other networks will result in permanent loss.
          </p>
        </div>

        {/* Testnet Faucet Note - teks datar */}
        <div className="pt-2 flex items-center gap-2.5 text-left text-xs text-[#5B6577]">
          <ShieldCheck className="w-4 h-4 text-[#047857] shrink-0" />
          <p>
            Need test ETH or USDC? You can request funds from public Base Sepolia faucets.
          </p>
        </div>
      </div>
    </div>
  );
}
