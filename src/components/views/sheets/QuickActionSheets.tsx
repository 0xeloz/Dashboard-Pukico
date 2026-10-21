import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Send,
} from 'lucide-react';
import type { UserProfile } from '../../../types';

interface SendSheetContentProps {
  onClose: () => void;
}

export function SendSheetContent({ onClose }: SendSheetContentProps) {
  const steps = [
    { num: '1', title: 'Choose an asset', desc: 'Select USDC or ETH on Base Sepolia.' },
    { num: '2', title: 'Enter a Pukico ID', desc: 'Type recipient @id without needing complex 0x addresses.' },
    { num: '3', title: 'Review and confirm', desc: 'Check network gas fees and sign with your embedded wallet.' },
  ];

  return (
    <div className="space-y-5">
      {/* Notice header - flat text style */}
      <div className="flex items-start gap-2.5 text-[#0052FF]">
        <Send className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-[#0A0B0D]">Sending by Pukico ID is coming soon.</h3>
          <p className="text-xs text-[#5B6577] mt-0.5 leading-relaxed">
            Direct peer-to-peer transfers using human-readable Pukico IDs will be activated in Phase 2.
          </p>
        </div>
      </div>

      {/* 3 Numbered Steps - Flat List */}
      <div className="space-y-3 pt-2">
        <div className="text-xs font-bold text-[#5B6577] uppercase tracking-wider">
          How Transfers Will Work
        </div>
        <div className="divide-y divide-[#E5E7EB]">
          {steps.map((s) => (
            <div key={s.num} className="flex items-start gap-3 py-3 first:pt-1">
              <div className="w-6 h-6 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {s.num}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[#0A0B0D]">{s.title}</div>
                <div className="text-xs text-[#5B6577] mt-0.5">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Single "Got it" button to close */}
      <button
        type="button"
        onClick={onClose}
        className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-[#0052FF] hover:bg-[#0042D6] text-white transition-colors cursor-pointer active:scale-[0.98]"
      >
        Got it
      </button>
    </div>
  );
}

interface ReceiveSheetContentProps {
  profile: UserProfile;
  isDemoMode: boolean;
}

export function ReceiveSheetContent({ profile, isDemoMode }: ReceiveSheetContentProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const formattedPukicoId = profile.pukico_id
    ? `@${profile.pukico_id.replace(/^@/, '')}`
    : '';

  useEffect(() => {
    if (profile.wallet_address) {
      QRCode.toDataURL(profile.wallet_address, {
        width: 180,
        margin: 0,
        color: {
          dark: '#0A0B0D',
          light: '#00000000', // transparent
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code generation failed:', err));
    }
  }, [profile.wallet_address]);

  const handleCopy = async (text: string, type: 'address' | 'id') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'address') {
        setCopiedAddress(true);
        setTimeout(() => setCopiedAddress(false), 2000);
      } else {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
      }
    } catch {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      if (type === 'address') {
        setCopiedAddress(true);
        setTimeout(() => setCopiedAddress(false), 2000);
      } else {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
      }
    }
  };

  return (
    <div className="space-y-4 text-center">
      {/* Network & Demo chip */}
      <div className="flex items-center justify-center gap-2">
        <span className="px-2.5 py-1 rounded-full bg-[#EEF4FF] text-[#0052FF] text-xs font-semibold">
          Base Sepolia · Testnet
        </span>
        {isDemoMode && (
          <span className="px-2 py-0.5 rounded-full bg-[#FFFBEB] text-[#B45309] text-[11px] font-bold border border-[#FDE68A]">
            DEMO DATA
          </span>
        )}
      </div>

      {/* QR Code tanpa bingkai (border-0, p-0, bg-transparent) */}
      <div className="flex justify-center my-2">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Base Sepolia Wallet QR"
            className="w-44 h-44 mx-auto block"
          />
        ) : (
          <div className="w-44 h-44 flex items-center justify-center text-xs text-[#5B6577]">
            Generating QR...
          </div>
        )}
      </div>

      {/* Pukico ID Row (jika ada, gaya datar) */}
      {formattedPukicoId && (
        <div className="py-2.5 border-b border-[#E5E7EB] flex items-center justify-between text-left">
          <div>
            <div className="text-[11px] font-medium text-[#5B6577]">Pukico ID</div>
            <div className="font-mono text-sm font-bold text-[#0A0B0D]">{formattedPukicoId}</div>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(formattedPukicoId, 'id')}
            className="px-2.5 py-1 rounded-lg border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-medium text-[#0A0B0D] flex items-center gap-1 transition-colors cursor-pointer"
          >
            {copiedId ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#047857]" />
                <span className="text-[#047857]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Alamat 0x sebagai teks monospace dengan tombol Copy (gaya datar) */}
      <div className="py-2.5 border-b border-[#E5E7EB] text-left">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-[#5B6577]">Wallet Address</span>
          <button
            type="button"
            onClick={() => handleCopy(profile.wallet_address, 'address')}
            className="px-2.5 py-1 rounded-lg border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-medium text-[#0A0B0D] flex items-center gap-1 transition-colors cursor-pointer"
          >
            {copiedAddress ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#047857]" />
                <span className="text-[#047857]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <div className="font-mono text-xs text-[#0A0B0D] break-all select-all font-semibold leading-relaxed">
          {profile.wallet_address}
        </div>
      </div>

      {/* Peringatan sebagai teks amber dengan ikon tanpa kotak berlatar */}
      <div className="pt-2 text-left flex items-start gap-2 text-xs text-[#B45309]">
        <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Only send Base Sepolia testnet assets (USDC, ETH). Anything else may be lost.
        </p>
      </div>
    </div>
  );
}

interface FaucetSheetContentProps {
  walletAddress: string;
  onRefreshBalance: () => Promise<void> | void;
  isRefreshing: boolean;
}

export function FaucetSheetContent({
  walletAddress,
  onRefreshBalance,
  isRefreshing,
}: FaucetSheetContentProps) {
  const [copied, setCopied] = useState(false);

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
    <div className="space-y-4">
      {/* Langkah 1: Copy your address (daftar datar) */}
      <div className="py-2.5 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold shrink-0">
            1
          </span>
          <span className="text-sm font-semibold text-[#0A0B0D]">Copy your address</span>
        </div>
        <div className="font-mono text-xs text-[#0A0B0D] break-all py-1 select-all font-medium">
          {walletAddress}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="mt-1.5 py-1.5 px-3 rounded-lg border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-semibold text-[#0A0B0D] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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

      {/* Langkah 2: Open Circle Faucet */}
      <div className="py-2.5 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold shrink-0">
            2
          </span>
          <span className="text-sm font-semibold text-[#0A0B0D]">
            Open Circle Faucet and choose Base Sepolia and USDC
          </span>
        </div>
        <p className="text-xs text-[#5B6577] mb-2.5">
          Paste your address on Circle&apos;s faucet to request 10.00 test USDC.
        </p>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-[#0052FF] hover:bg-[#0042D6] text-white text-xs font-semibold transition-colors cursor-pointer"
        >
          <span>Open faucet</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Langkah 3: Come back and refresh */}
      <div className="py-2.5 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold shrink-0">
            3
          </span>
          <span className="text-sm font-semibold text-[#0A0B0D]">Come back and refresh</span>
        </div>
        <p className="text-xs text-[#5B6577] mb-2.5">
          Once the transaction confirms on Base Sepolia, refresh your balance.
        </p>
        <button
          type="button"
          onClick={onRefreshBalance}
          disabled={isRefreshing}
          className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-semibold text-[#0052FF] transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Updating balance...' : 'Refresh balance'}</span>
        </button>
      </div>

      {/* Catatan abu kecil tanpa kotak berlatar */}
      <p className="text-xs text-[#5B6577] leading-relaxed pt-1">
        You also need a little test ETH to pay network fees. An ETH faucet isn&apos;t connected yet.
      </p>
    </div>
  );
}
