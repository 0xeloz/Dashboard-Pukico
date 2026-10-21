import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Copy, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { CHAIN_CONFIG } from '../../lib/config';

interface ReceiveViewProps {
  walletAddress: string;
  onBack: () => void;
}

export function ReceiveView({ walletAddress, onBack }: ReceiveViewProps) {
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

      {/* Main card (rounded-[20px], white, border #E5E7EB) */}
      <div className="bg-white rounded-[20px] border border-[#E5E7EB] p-6 text-center shadow-2xs">
        {/* Network indicator */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EEF4FF] border border-[#E5E7EB] mb-5">
          <span className="w-2 h-2 rounded-full bg-[#0052FF]" />
          <span className="text-xs font-semibold text-[#0052FF]">Network: {CHAIN_CONFIG.name}</span>
          <span className="text-xs text-[#5B6577]">· ID {CHAIN_CONFIG.id}</span>
        </div>

        {/* QR Code Container */}
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-white rounded-2xl border border-[#E5E7EB] inline-block shadow-2xs">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Wallet QR Code"
                className="w-48 h-48 sm:w-56 sm:h-56 mx-auto block"
              />
            ) : (
              <div className="w-48 h-48 sm:w-56 sm:h-56 bg-[#EEF4FF] rounded-xl flex items-center justify-center text-xs text-[#5B6577]">
                Generating QR...
              </div>
            )}
          </div>
        </div>

        {/* Address and Copy */}
        <div className="mb-4 text-left">
          <label className="block text-xs font-medium text-[#5B6577] mb-1.5">
            Your Wallet Address
          </label>
          <div className="p-3.5 bg-[#F7F8FA] rounded-xl border border-[#E5E7EB] flex items-center justify-between gap-3">
            <span className="font-mono text-xs sm:text-sm text-[#0A0B0D] break-all select-all font-semibold">
              {walletAddress}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={`w-full py-3.5 px-4 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] ${
            copied
              ? 'bg-[#ECFDF5] text-[#047857] border border-[#047857]/30'
              : 'bg-[#0052FF] hover:bg-[#0042D6] text-white shadow-xs'
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              <span>Copied to Clipboard</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy Address</span>
            </>
          )}
        </button>
      </div>

      {/* Mandatory Warning */}
      <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-[20px] p-4 flex items-start gap-3 text-left">
        <AlertTriangle className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-[#B91C1C] mb-0.5">Testnet Assets Only</h4>
          <p className="text-xs text-[#B91C1C]/90 leading-relaxed">
            Only send Base Sepolia testnet assets to this address. Sending mainnet funds or assets from other networks will result in permanent loss.
          </p>
        </div>
      </div>

      {/* Testnet Faucet Note */}
      <div className="p-4 rounded-[20px] bg-white border border-[#E5E7EB] flex items-center gap-3 text-left shadow-2xs">
        <ShieldCheck className="w-5 h-5 text-[#047857] shrink-0" />
        <p className="text-xs text-[#5B6577]">
          Need test ETH or USDC? You can request funds from public Base Sepolia faucets.
        </p>
      </div>
    </div>
  );
}
