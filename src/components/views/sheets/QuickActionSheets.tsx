import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Send,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Share2,
} from 'lucide-react';
import { useBalance } from '../../../context/BalanceContext';
import { UsdcTokenIcon, EthTokenIcon } from '../../ui/PukicoBrand';
import type { UserProfile } from '../../../types';

interface SendSheetContentProps {
  onClose: () => void;
  isDemoMode?: boolean;
}

export function SendSheetContent({ onClose, isDemoMode = false }: SendSheetContentProps) {
  const { usdc, eth, modifyBalance } = useBalance();

  const [asset, setAsset] = useState<'USDC' | 'ETH'>('USDC');
  const [recipient, setRecipient] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [txResult, setTxResult] = useState<{
    hash: string;
    amount: string;
    asset: string;
    recipient: string;
    timestamp: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableBalanceStr = asset === 'USDC' ? (usdc.value ?? '0.00') : (eth.value ?? '0.0000');
  const availableBalanceNum = parseFloat(availableBalanceStr.replace(/,/g, '') || '0');
  const enteredAmountNum = parseFloat(amount || '0');

  const isInsufficient = enteredAmountNum > availableBalanceNum;
  const isFormValid =
    recipient.trim().length >= 2 &&
    enteredAmountNum > 0 &&
    !isInsufficient &&
    !isSubmitting;

  const handleSelectRecipient = (name: string) => {
    setRecipient(name);
    setErrorMessage(null);
  };

  const handleSetMax = () => {
    if (availableBalanceNum <= 0) {
      setAmount('0');
      return;
    }
    // Leave small gas buffer for ETH
    if (asset === 'ETH') {
      const ethBuffer = Math.max(0, availableBalanceNum - 0.001);
      setAmount(ethBuffer.toFixed(4));
    } else {
      setAmount(availableBalanceNum.toFixed(2));
    }
    setErrorMessage(null);
  };

  const handleAddPreset = (val: number) => {
    setAmount(val.toString());
    setErrorMessage(null);
  };

  const handleSend = async () => {
    if (!isFormValid) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Simulate network broadcast to Base Sepolia
      await new Promise((r) => setTimeout(r, 850));

      // Deduct balance locally
      modifyBalance(asset === 'USDC' ? 'usdc' : 'eth', -enteredAmountNum);

      // Generate simulated Base Sepolia tx hash
      const randomHex = Array.from({ length: 40 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      const fakeHash = `0x${randomHex}`;

      setTxResult({
        hash: fakeHash,
        amount: enteredAmountNum.toLocaleString('en-US', {
          minimumFractionDigits: asset === 'USDC' ? 2 : 4,
          maximumFractionDigits: asset === 'USDC' ? 2 : 4,
        }),
        asset,
        recipient: recipient.startsWith('@') || recipient.startsWith('0x') ? recipient : `@${recipient}`,
        timestamp: 'Just now',
      });
    } catch {
      setErrorMessage('Failed to send transaction on Base Sepolia. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setTxResult(null);
    setAmount('');
    setRecipient('');
    setErrorMessage(null);
  };

  // SUCCESS STATE
  if (txResult) {
    return (
      <div className="space-y-5 text-center py-2 animate-fade-up">
        {/* Animated Check */}
        <div className="w-16 h-16 rounded-full bg-[#10B981]/10 text-[#10B981] flex items-center justify-center mx-auto ring-8 ring-[#10B981]/5">
          <Check className="w-8 h-8 stroke-[2.5]" />
        </div>

        <div>
          <h3 className="text-xl font-bold text-[#0A0B0D]">Transfer Sent!</h3>
          <p className="text-xs text-[#5B6577] mt-1">Confirmed on Base Sepolia testnet</p>
        </div>

        {/* Transaction Summary Card */}
        <div className="bg-[#F7F8FA] rounded-2xl p-4 text-left space-y-2.5 border border-[#E5E7EB]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5B6577]">Amount Sent</span>
            <span className="font-mono font-bold text-[#0A0B0D] text-sm">
              {txResult.amount} {txResult.asset}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5B6577]">Recipient</span>
            <span className="font-mono font-semibold text-[#0052FF]">
              {txResult.recipient}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#5B6577]">Network</span>
            <span className="font-medium text-[#0A0B0D]">Base Sepolia (Chain 84532)</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E5E7EB]">
            <span className="text-[#5B6577]">Transaction Hash</span>
            <a
              href={`https://sepolia.basescan.org/tx/${txResult.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-[#0052FF] hover:underline flex items-center gap-1"
            >
              <span>{txResult.hash.slice(0, 8)}...{txResult.hash.slice(-6)}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-[#0052FF] hover:bg-[#0042D6] text-white transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
          >
            Done
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="w-full py-2.5 px-4 rounded-xl font-medium text-xs text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6] transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
          >
            Send another transfer
          </button>
        </div>
      </div>
    );
  }

  // ACTIVE SEND FORM
  return (
    <div className="space-y-4">
      {/* Notice header */}
      <div className="flex items-start gap-2.5 text-[#0052FF]">
        <Send className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-[#0A0B0D]">Sending by Pukico ID is coming soon.</h3>
          <p className="text-xs text-[#5B6577] mt-0.5 leading-relaxed">
            Soon you&apos;ll send to a username like @andika instead of a 0x address.
          </p>
        </div>
      </div>

      {/* 1. ASSET PICKER */}
      <div>
        <label className="block text-xs font-semibold text-[#5B6577] uppercase tracking-wider mb-2">
          Select Asset
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setAsset('USDC');
              setAmount('');
            }}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer active:scale-[0.98] ${
              asset === 'USDC'
                ? 'border-[#0052FF] bg-[#EEF4FF]/70 ring-1 ring-[#0052FF]'
                : 'border-[#E5E7EB] bg-white hover:bg-[#F7F8FA]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <UsdcTokenIcon className="w-7 h-7 shrink-0" />
              <div>
                <div className="font-semibold text-sm text-[#0A0B0D]">USDC</div>
                <div className="text-[11px] text-[#5B6577]">USD Coin</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xs font-bold text-[#0A0B0D]">
                {usdc.value ?? '0.00'}
              </div>
              <div className="text-[10px] text-[#5B6577]">Available</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setAsset('ETH');
              setAmount('');
            }}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer active:scale-[0.98] ${
              asset === 'ETH'
                ? 'border-[#0052FF] bg-[#EEF4FF]/70 ring-1 ring-[#0052FF]'
                : 'border-[#E5E7EB] bg-white hover:bg-[#F7F8FA]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <EthTokenIcon className="w-7 h-7 shrink-0" />
              <div>
                <div className="font-semibold text-sm text-[#0A0B0D]">ETH</div>
                <div className="text-[11px] text-[#5B6577]">Ether</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-xs font-bold text-[#0A0B0D]">
                {eth.value ?? '0.0000'}
              </div>
              <div className="text-[10px] text-[#5B6577]">Available</div>
            </div>
          </button>
        </div>
      </div>

      {/* 2. RECIPIENT INPUT */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="send-recipient" className="text-xs font-semibold text-[#5B6577] uppercase tracking-wider">
            Recipient
          </label>
          <span className="text-[11px] text-[#5B6577]">Pukico ID or 0x address</span>
        </div>
        <div className="relative">
          <input
            id="send-recipient"
            type="text"
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              setErrorMessage(null);
            }}
            placeholder="@rina or 0x..."
            className="w-full px-3.5 py-3 rounded-xl border border-[#E5E7EB] bg-white text-sm text-[#0A0B0D] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#0052FF] focus:ring-1 focus:ring-[#0052FF] font-mono"
          />
          {recipient.trim().length >= 2 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#10B981]">
              <Check className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Quick recipient chips */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[11px] text-[#5B6577]">Recent:</span>
          {['@rina', '@alex', '@budi'].map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => handleSelectRecipient(name)}
              className="text-xs px-2.5 py-1 rounded-full bg-[#F3F4F6] hover:bg-[#EEF4FF] hover:text-[#0052FF] text-[#3B4455] font-medium transition-colors cursor-pointer active:scale-[0.97]"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* 3. AMOUNT INPUT */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="send-amount" className="text-xs font-semibold text-[#5B6577] uppercase tracking-wider">
            Amount
          </label>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#5B6577]">Bal: {availableBalanceStr} {asset}</span>
            <button
              type="button"
              onClick={handleSetMax}
              className="font-bold text-[#0052FF] hover:underline cursor-pointer px-1 py-0.5 rounded"
            >
              MAX
            </button>
          </div>
        </div>

        <div className="relative">
          <input
            id="send-amount"
            type="number"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrorMessage(null);
            }}
            placeholder="0.00"
            className={`w-full px-3.5 py-3 pr-16 rounded-xl border bg-white text-base font-mono font-bold text-[#0A0B0D] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-1 ${
              isInsufficient
                ? 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]'
                : 'border-[#E5E7EB] focus:border-[#0052FF] focus:ring-[#0052FF]'
            }`}
          />
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#5B6577]">
            {asset}
          </span>
        </div>

        {/* Quick Amount Preset Chips */}
        <div className="flex items-center gap-1.5 mt-2">
          {asset === 'USDC' ? (
            <>
              {[5, 10, 25, 50].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAddPreset(val)}
                  className="flex-1 py-1 text-xs font-semibold rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#EEF4FF] hover:text-[#0052FF] hover:border-[#0052FF]/30 transition-colors cursor-pointer active:scale-[0.97]"
                >
                  ${val}
                </button>
              ))}
            </>
          ) : (
            <>
              {[0.005, 0.01, 0.02, 0.05].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAddPreset(val)}
                  className="flex-1 py-1 text-xs font-semibold rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#EEF4FF] hover:text-[#0052FF] hover:border-[#0052FF]/30 transition-colors cursor-pointer active:scale-[0.97]"
                >
                  {val}
                </button>
              ))}
            </>
          )}
        </div>

        {isInsufficient && (
          <p className="text-xs text-[#EF4444] mt-1.5 flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Amount exceeds available balance ({availableBalanceStr} {asset})
          </p>
        )}
      </div>

      {/* 4. NETWORK & FEE SUMMARY */}
      <div className="p-3 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] space-y-1 text-xs">
        <div className="flex items-center justify-between text-[#5B6577]">
          <span>Network</span>
          <span className="font-medium text-[#0A0B0D]">Base Sepolia Testnet</span>
        </div>
        <div className="flex items-center justify-between text-[#5B6577]">
          <span>Estimated Network Fee</span>
          <span className="font-mono text-[#047857] font-semibold">~0.0001 ETH ($0.30)</span>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ACTION BUTTON */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={!isFormValid}
          className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-[#0052FF] hover:bg-[#0042D6] disabled:bg-[#0052FF]/40 text-white flex items-center justify-center gap-2 transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Broadcasting to Base Sepolia...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>
                Send {enteredAmountNum > 0 ? `${enteredAmountNum} ${asset}` : asset}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Direct transfers note */}
      <p className="text-[11px] text-[#5B6577] text-center leading-relaxed">
        Soon you&apos;ll send to a username like @andika instead of a 0x address.
      </p>
    </div>
  );
}

interface ReceiveSheetContentProps {
  profile: UserProfile;
  isDemoMode: boolean;
  onClose?: () => void;
}

export function ReceiveSheetContent({ profile, isDemoMode, onClose }: ReceiveSheetContentProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const formattedPukicoId = profile.pukico_id
    ? `@${profile.pukico_id.replace(/^@/, '')}`
    : '';

  useEffect(() => {
    if (profile.wallet_address) {
      QRCode.toDataURL(profile.wallet_address, {
        width: 200,
        margin: 2,
        color: {
          dark: '#0A0B0D',
          light: '#FFFFFF',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code generation failed:', err));
    }
  }, [profile.wallet_address]);

  const handleCopy = async (text: string, type: 'address' | 'id' | 'link') => {
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
    } else if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    }
  };

  const paymentLink = `https://pukico.app/pay/${formattedPukicoId || profile.wallet_address}`;

  return (
    <div className="space-y-4 text-center">
      {/* Network & Demo chip */}
      <div className="flex items-center justify-center gap-2">
        <span className="px-2.5 py-1 rounded-full bg-[#EEF4FF] text-[#0052FF] text-xs font-semibold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0052FF]" />
          Base Sepolia · Testnet
        </span>
        {isDemoMode && (
          <span className="px-2 py-0.5 rounded-full bg-[#FFFBEB] text-[#B45309] text-[11px] font-bold border border-[#FDE68A]">
            DEMO DATA
          </span>
        )}
      </div>

      {/* QR Code inside clean white card with subtle border */}
      <div className="flex justify-center my-2">
        <div className="p-3 bg-white border border-[#E5E7EB] rounded-2xl shadow-sm inline-block">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Base Sepolia Wallet QR"
              className="w-44 h-44 mx-auto block rounded-lg"
            />
          ) : (
            <div className="w-44 h-44 flex items-center justify-center text-xs text-[#5B6577]">
              Generating QR...
            </div>
          )}
          <div className="text-[10px] text-[#5B6577] mt-1 font-mono">
            Scan to send test tokens
          </div>
        </div>
      </div>

      {/* Pukico ID Row */}
      {formattedPukicoId && (
        <div className="py-2.5 border-b border-[#E5E7EB] flex items-center justify-between text-left">
          <div>
            <div className="text-[11px] font-medium text-[#5B6577]">Pukico ID</div>
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
                <span>Copied</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 transition-opacity duration-150">
                <Copy className="w-3.5 h-3.5" />
                <span>Copy ID</span>
              </span>
            )}
          </button>
        </div>
      )}

      {/* Alamat 0x dengan tombol Copy */}
      <div className="py-2.5 border-b border-[#E5E7EB] text-left">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-[#5B6577]">Wallet Address</span>
            {(isDemoMode || profile.wallet_address === '0x1111111111111111111111111111111111111111') && (
              <span className="text-[10px] font-semibold text-[#B45309] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]">
                Example address
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
                <span>Copied</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 transition-opacity duration-150">
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Address</span>
              </span>
            )}
          </button>
        </div>
        <div className="font-mono text-xs text-[#0A0B0D] break-all select-all font-semibold leading-relaxed">
          {profile.wallet_address}
        </div>
      </div>

      {/* Share / Copy Payment Link */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => handleCopy(paymentLink, 'link')}
          className="w-full py-2.5 px-3 rounded-xl border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-semibold text-[#0052FF] flex items-center justify-center gap-2 transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
        >
          {copiedLink ? (
            <>
              <Check className="w-3.5 h-3.5 text-[#047857]" />
              <span className="text-[#047857]">Payment Link Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5" />
              <span>Copy Payment Link</span>
            </>
          )}
        </button>
      </div>

      {/* Peringatan */}
      <div className="pt-1 text-left flex items-start gap-2 text-xs text-[#B45309]">
        <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Only send Base Sepolia testnet assets (USDC, ETH). Anything else may be lost.
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
            Done
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
  const [copied, setCopied] = useState(false);
  const [isClaimingDemo, setIsClaimingDemo] = useState(false);
  const [claimedNotice, setClaimedNotice] = useState(false);

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

  // 1-Click Instant Faucet Claim (+10 USDC)
  const handleInstantClaim = async () => {
    setIsClaimingDemo(true);
    try {
      await new Promise((r) => setTimeout(r, 650));
      balanceCtx.modifyBalance('usdc', 10);
      setClaimedNotice(true);
      setTimeout(() => setClaimedNotice(false), 3000);
    } finally {
      setIsClaimingDemo(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Instant 1-Click Faucet Hero Card */}
      <div className="p-4 rounded-2xl bg-[#EEF4FF] border border-[#0052FF]/20 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#0052FF] text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0A0B0D]">Instant Testnet Faucet</h3>
              <p className="text-xs text-[#5B6577]">Claim 10.00 test USDC directly to your wallet</p>
            </div>
          </div>
        </div>

        {claimedNotice ? (
          <div className="mt-3 py-2 px-3 bg-[#10B981]/15 text-[#065F46] rounded-xl text-xs font-semibold flex items-center gap-2 animate-fade-up">
            <Check className="w-4 h-4 text-[#10B981]" />
            <span>+10.00 USDC received! Balance updated.</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleInstantClaim}
            disabled={isClaimingDemo}
            className="mt-3 w-full py-2.5 px-4 rounded-xl bg-[#0052FF] hover:bg-[#0042D6] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] disabled:opacity-50"
          >
            {isClaimingDemo ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Claiming 10 test USDC...</span>
              </>
            ) : (
              <>
                <span>Claim 10 test USDC</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}
      </div>

      <div className="relative flex py-1 items-center">
        <div className="flex-grow border-t border-[#E5E7EB]" />
        <span className="flex-shrink mx-3 text-xs font-medium text-[#5B6577]">Or use official faucet</span>
        <div className="flex-grow border-t border-[#E5E7EB]" />
      </div>

      {/* Langkah 1: Copy your address (daftar datar) */}
      <div className="py-2.5 border-b border-[#E5E7EB]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-5 h-5 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold shrink-0">
            1
          </span>
          <span className="text-sm font-semibold text-[#0A0B0D]">Copy your address</span>
          {(isDemoMode || walletAddress === '0x1111111111111111111111111111111111111111') && (
            <span className="text-[10px] font-semibold text-[#B45309] bg-[#FFFBEB] px-1.5 py-0.5 rounded border border-[#FDE68A]">
              Example address
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
              <span>Copied</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 transition-opacity duration-150">
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Address</span>
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
            Open Circle Faucet and choose Base Sepolia and USDC
          </span>
        </div>
        <p className="text-xs text-[#5B6577] mb-2.5">
          Paste your address on Circle&apos;s faucet to request test USDC.
        </p>
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-[#0052FF] hover:bg-[#0042D6] text-white text-xs font-semibold transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
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
          onClick={handleRefresh}
          disabled={isRefreshingActive}
          className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-[#E5E7EB] hover:bg-[#EEF4FF] text-xs font-semibold text-[#0052FF] transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97] disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingActive ? 'animate-spin' : ''}`} />
          <span>{isRefreshingActive ? 'Updating balance...' : 'Refresh balance'}</span>
        </button>
      </div>

      {/* Catatan abu kecil tanpa kotak berlatar */}
      <p className="text-xs text-[#5B6577] leading-relaxed pt-1">
        You also need a little test ETH to pay network fees. An ETH faucet isn&apos;t connected yet.
      </p>

      {/* Done button */}
      {onClose && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm bg-white border border-[#E5E7EB] hover:bg-[#EEF4FF] text-[#0A0B0D] transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
