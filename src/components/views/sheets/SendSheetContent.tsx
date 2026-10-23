import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Check,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { encodeFunctionData, erc20Abi, parseUnits, formatUnits } from 'viem';
import { useAuth } from '../../../context/AuthContext';
import { useBalance } from '../../../context/BalanceContext';
import { useT } from '../../../i18n';
import { publicClient, BASE_SEPOLIA_USDC_ADDRESS } from '../../../lib/viemClient';
import { formatEthFee, formatAssetAmount } from '../../../lib/formatters';
import {
  resolvePukicoId,
  submitTx,
  submitTxWithRetry,
  syncTx,
  savePendingTx,
  shortenAddress,
  getExplorerUrl,
  type TxRecord,
} from '../../../lib/txApi';
import { useFriends } from '../../../context/FriendsContext';
import type { UserProfile } from '../../../types';

interface SendSheetContentProps {
  onClose: () => void;
  isDemoMode?: boolean;
  onApprovalStateChange?: (isWaiting: boolean) => void;
  prefilledRecipientId?: string | null;
}

type SendStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type AssetType = 'USDC' | 'ETH';

const BASE_SEPOLIA_CHAIN_ID = 84532;
const FAUCET_URL = 'https://portal.cdp.coinbase.com/products/faucet';

export function SendSheetContent({
  onClose,
  isDemoMode = false,
  onApprovalStateChange,
  prefilledRecipientId,
}: SendSheetContentProps) {
  const { t, formatNumber } = useT();
  const { profile, getAccessToken, sendTransaction } = useAuth();
  const { usdc, eth, refresh } = useBalance();
  const { friends } = useFriends();

  const [step, setStep] = useState<SendStep>(1);
  const [selectedAsset, setSelectedAsset] = useState<AssetType>('USDC');

  // Step 2: Recipient
  const [recipientInput, setRecipientInput] = useState<string>('');
  const [recipientStatus, setRecipientStatus] = useState<
    'idle' | 'looking' | 'found' | 'not_found' | 'own_id' | 'format_error'
  >('idle');
  const [resolvedRecipient, setResolvedRecipient] = useState<{
    id: string;
    address: string;
  } | null>(null);

  const resolveDebounceRef = useRef<number | null>(null);
  const resolveControllerRef = useRef<AbortController | null>(null);
  const latestResolveReqIdRef = useRef<number>(0);

  // Step 3: Amount & Fees
  const [amountInput, setAmountInput] = useState<string>('');
  const [estimatedFeeEth, setEstimatedFeeEth] = useState<string | null>(null);
  const [estimatedFeeWei, setEstimatedFeeWei] = useState<bigint | null>(null);
  const [isEstimatingFee, setIsEstimatingFee] = useState<boolean>(false);
  const feeEstimateDebounceRef = useRef<number | null>(null);

  // Step 5 & 6: Execution & Progress
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [progressState, setProgressState] = useState<'waiting_approval' | 'waiting_confirmation' | null>(null);
  const [sendFailedBeforeHash, setSendFailedBeforeHash] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<string>('');
  const [finalTxRecord, setFinalTxRecord] = useState<TxRecord | null>(null);
  const [finalStatus, setFinalStatus] = useState<'confirmed' | 'failed' | 'timeout' | null>(null);

  // Inform parent whether approval is in progress (to prevent backdrop clicks)
  useEffect(() => {
    const isWaiting = progressState === 'waiting_approval';
    onApprovalStateChange?.(isWaiting);
    return () => {
      onApprovalStateChange?.(false);
    };
  }, [progressState, onApprovalStateChange]);

  // Check ETH balance for gas fee availability
  const ethParsedNum = eth.value !== null ? parseFloat(String(eth.value).replace(/,/g, '').replace('<', '').trim()) : null;
  const isEthZero = ethParsedNum !== null && !isNaN(ethParsedNum) && ethParsedNum === 0;

  // Prerequisites check
  const isWalletUnverified = profile?.wallet_verified === false;

  // Handle Recipient Input & 400ms Debounced Lookup
  const handleRecipientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/^@+/, '').toLowerCase();
    const sanitized = rawVal.replace(/[^a-z0-9_]/g, '').slice(0, 20);
    setRecipientInput(sanitized);

    if (resolveDebounceRef.current) {
      window.clearTimeout(resolveDebounceRef.current);
    }
    if (resolveControllerRef.current) {
      resolveControllerRef.current.abort();
    }

    if (sanitized.length === 0) {
      setRecipientStatus('idle');
      setResolvedRecipient(null);
      return;
    }

    if (sanitized.length < 3) {
      setRecipientStatus('format_error');
      setResolvedRecipient(null);
      return;
    }

    // Check if own ID
    if (profile?.pukico_id && sanitized === profile.pukico_id.toLowerCase().replace(/^@/, '')) {
      setRecipientStatus('own_id');
      setResolvedRecipient(null);
      return;
    }

    setRecipientStatus('looking');
    const controller = new AbortController();
    resolveControllerRef.current = controller;
    const reqId = ++latestResolveReqIdRef.current;

    resolveDebounceRef.current = window.setTimeout(async () => {
      try {
        const token = getAccessToken ? await getAccessToken() : null;
        const result = await resolvePukicoId(sanitized, { privyToken: token, isDemoMode }, controller.signal);

        if (reqId === latestResolveReqIdRef.current) {
          if (result.is_self) {
            setRecipientStatus('own_id');
            setResolvedRecipient(null);
          } else if (result.found && result.wallet_address) {
            setRecipientStatus('found');
            setResolvedRecipient({
              id: result.pukico_id || sanitized,
              address: result.wallet_address,
            });
          } else if (result.reason === 'format') {
            setRecipientStatus('format_error');
            setResolvedRecipient(null);
          } else {
            setRecipientStatus('not_found');
            setResolvedRecipient(null);
          }
        }
      } catch (err: unknown) {
        if (reqId === latestResolveReqIdRef.current && (err as Error)?.name !== 'AbortError') {
          setRecipientStatus('not_found');
          setResolvedRecipient(null);
        }
      }
    }, 400);
  };

  // Prefill resolver when opened with recipientId from friends tab
  useEffect(() => {
    if (prefilledRecipientId) {
      const clean = prefilledRecipientId.replace(/^@/, '').toLowerCase().trim();
      setRecipientInput(clean);
      setRecipientStatus('looking');
      (async () => {
        try {
          const token = getAccessToken ? await getAccessToken() : null;
          const result = await resolvePukicoId(clean, { privyToken: token, isDemoMode });
          if (result.found && result.wallet_address) {
            setRecipientStatus('found');
            setResolvedRecipient({
              id: result.pukico_id || clean,
              address: result.wallet_address,
            });
          } else {
            setRecipientStatus('not_found');
            setResolvedRecipient(null);
          }
        } catch {
          setRecipientStatus('not_found');
          setResolvedRecipient(null);
        }
      })();
    }
  }, [prefilledRecipientId, getAccessToken, isDemoMode]);

  const handleSelectFriendChip = (id: string) => {
    const clean = id.replace(/^@/, '').toLowerCase().trim();
    setRecipientInput(clean);
    setRecipientStatus('looking');
    (async () => {
      try {
        const token = getAccessToken ? await getAccessToken() : null;
        const result = await resolvePukicoId(clean, { privyToken: token, isDemoMode });
        if (result.found && result.wallet_address) {
          setRecipientStatus('found');
          setResolvedRecipient({
            id: result.pukico_id || clean,
            address: result.wallet_address,
          });
        } else {
          setRecipientStatus('not_found');
          setResolvedRecipient(null);
        }
      } catch {
        setRecipientStatus('not_found');
        setResolvedRecipient(null);
      }
    })();
  };

  // Fee Estimation with 500ms debounce
  const calculateFee = useCallback(
    async (asset: AssetType, targetAddr: string, valStr: string) => {
      setIsEstimatingFee(true);
      try {
        const fees = await publicClient.estimateFeesPerGas();
        const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice ?? 1500000000n;

        let gasLimit = 21000n;
        const sender = (profile?.wallet_address || '0x0000000000000000000000000000000000000000') as `0x${string}`;
        const recipient = (targetAddr || '0x0000000000000000000000000000000000000000') as `0x${string}`;

        if (asset === 'ETH') {
          let testValWei = 1n;
          try {
            if (valStr && Number(valStr) > 0) {
              testValWei = parseUnits(valStr, 18);
            }
          } catch {
            testValWei = 1n;
          }

          if (profile?.wallet_address && targetAddr) {
            const estimated = await publicClient
              .estimateGas({
                account: sender,
                to: recipient,
                value: testValWei,
              })
              .catch(() => 21000n);
            gasLimit = estimated;
          }
        } else {
          let testValUnits = 1n;
          try {
            if (valStr && Number(valStr) > 0) {
              testValUnits = parseUnits(valStr, 6);
            }
          } catch {
            testValUnits = 1n;
          }

          const callData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [recipient, testValUnits],
          });

          if (profile?.wallet_address && targetAddr) {
            const estimated = await publicClient
              .estimateGas({
                account: sender,
                to: BASE_SEPOLIA_USDC_ADDRESS as `0x${string}`,
                data: callData,
              })
              .catch(() => 65000n);
            gasLimit = estimated;
          } else {
            gasLimit = 65000n;
          }
        }

        const totalWei = gasLimit * maxFeePerGas;
        setEstimatedFeeWei(totalWei);
        setEstimatedFeeEth(formatEthFee(totalWei));
      } catch {
        // Fallback standard Base Sepolia gas limit only for ETH balance reservation, NOT displayed as fee
        const fallbackWei = asset === 'ETH' ? 21000n * 1500000000n : 65000n * 1500000000n;
        setEstimatedFeeWei(fallbackWei);
        setEstimatedFeeEth(null);
      } finally {
        setIsEstimatingFee(false);
      }
    },
    [profile?.wallet_address]
  );

  // Trigger fee calculation on step 3 change
  useEffect(() => {
    if (step === 3 && resolvedRecipient?.address) {
      if (feeEstimateDebounceRef.current) {
        window.clearTimeout(feeEstimateDebounceRef.current);
      }
      feeEstimateDebounceRef.current = window.setTimeout(() => {
        calculateFee(selectedAsset, resolvedRecipient.address, amountInput);
      }, 500);
    }

    return () => {
      if (feeEstimateDebounceRef.current) {
        window.clearTimeout(feeEstimateDebounceRef.current);
      }
    };
  }, [step, selectedAsset, resolvedRecipient?.address, amountInput, calculateFee]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (resolveDebounceRef.current) window.clearTimeout(resolveDebounceRef.current);
      if (feeEstimateDebounceRef.current) window.clearTimeout(feeEstimateDebounceRef.current);
      if (resolveControllerRef.current) resolveControllerRef.current.abort();
    };
  }, []);

  // Validation using parseUnits and BigInt (no float math)
  const validateAmount = (): { valid: boolean; errorKey?: string } => {
    if (!amountInput || amountInput.trim() === '') {
      return { valid: false, errorKey: 'enterAmountPlaceholder' };
    }

    try {
      const decimals = selectedAsset === 'USDC' ? 6 : 18;
      const parsedAmount = parseUnits(amountInput.trim(), decimals);

      if (parsedAmount <= 0n) {
        return { valid: false, errorKey: 'enterAmountPlaceholder' };
      }

      const balanceStr = selectedAsset === 'USDC' ? usdc.value || '0' : eth.value || '0';
      const balanceBigInt = parseUnits(balanceStr.trim(), decimals);

      if (parsedAmount > balanceBigInt) {
        return { valid: false, errorKey: 'notEnoughAsset' };
      }

      if (selectedAsset === 'USDC' && isEthZero) {
        return { valid: false, errorKey: 'needEthForFees' };
      }

      return { valid: true };
    } catch {
      return { valid: false, errorKey: 'enterAmountPlaceholder' };
    }
  };

  const amountValidation = validateAmount();

  // Max Button handler
  const handleMaxAmount = () => {
    if (selectedAsset === 'USDC') {
      const raw = usdc.value || '0';
      setAmountInput(raw);
    } else {
      // ETH: Reserve gas fee
      try {
        const totalEthWei = parseUnits(eth.value || '0', 18);
        const reserveFee = estimatedFeeWei && estimatedFeeWei > 0n ? estimatedFeeWei : 21000n * 1500000000n;
        if (totalEthWei > reserveFee) {
          const sendableWei = totalEthWei - reserveFee;
          const formatted = formatUnits(sendableWei, 18);
          // Max 8 decimals without trailing zeros
          const parts = formatted.split('.');
          if (parts.length > 1) {
            const dec = parts[1].slice(0, 8).replace(/0+$/, '');
            setAmountInput(dec ? `${parts[0]}.${dec}` : parts[0]);
          } else {
            setAmountInput(formatted);
          }
        } else {
          setAmountInput('0');
        }
      } catch {
        setAmountInput('0');
      }
    }
  };

  // Step 5: Execute Transaction
  const handleExecuteSend = async () => {
    if (isSubmitting || !resolvedRecipient) return;

    setIsSubmitting(true);
    setProgressState('waiting_approval');
    setSendFailedBeforeHash(false);

    // Demo Mode: Direct honest static flow (no fake hashes, no fake wait timers)
    if (isDemoMode) {
      setStep(7);
      setFinalStatus('confirmed');
      setFinalTxRecord({
        tx_hash: '0xdemo1111111111111111111111111111111111111111111111111111111111111111',
        asset: selectedAsset,
        amount: amountInput,
        to_pukico_id: resolvedRecipient.id,
        status: 'confirmed',
        explorer_url: 'https://sepolia.basescan.org',
      });
      setIsSubmitting(false);
      setProgressState(null);
      return;
    }

    let broadcastHash = '';

    // Step A: Prompt wallet transaction and obtain hash
    try {
      if (!sendTransaction) {
        throw new Error('Wallet transaction provider not available.');
      }

      let txRequest: any;

      if (selectedAsset === 'ETH') {
        txRequest = {
          to: resolvedRecipient.address as `0x${string}`,
          value: parseUnits(amountInput, 18),
          chainId: BASE_SEPOLIA_CHAIN_ID,
        };
      } else {
        const transferData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [resolvedRecipient.address as `0x${string}`, parseUnits(amountInput, 6)],
        });

        txRequest = {
          to: BASE_SEPOLIA_USDC_ADDRESS as `0x${string}`,
          data: transferData,
          chainId: BASE_SEPOLIA_CHAIN_ID,
        };
      }

      // Prompt native Privy modal preview
      const result = await sendTransaction(txRequest);

      // Safe hash extraction
      broadcastHash = (result as any)?.hash || (result as any)?.transactionHash || (typeof result === 'string' ? result : '');

      if (!broadcastHash) {
        throw new Error('No transaction hash returned.');
      }
    } catch (_errBeforeHash) {
      // Failed before hash was produced (cancelled, rejected, modal closed, etc.)
      // Do not guess error type from text
      setSendFailedBeforeHash(true);
      setProgressState(null);
      setIsSubmitting(false);
      return;
    }

    // Step B: Hash exists - transition to confirmation waiting
    setTxHash(broadcastHash);
    setProgressState('waiting_confirmation');
    setStep(6);

    // Store in localStorage immediately (entri pukico.pendingTx tetap tersimpan)
    savePendingTx({
      tx_hash: broadcastHash,
      asset: selectedAsset,
      to_pukico_id: resolvedRecipient.id,
      amount: amountInput,
    });

    try {
      const token = getAccessToken ? await getAccessToken() : null;

      // Initial submit to backend
      try {
        await submitTxWithRetry(
          {
            tx_hash: broadcastHash,
            asset: selectedAsset,
            to_pukico_id: resolvedRecipient.id,
            amount: amountInput,
          },
          { privyToken: token }
        );
      } catch {
        // Continue to polling loop even if initial submit had issues
      }

      // Poll sync every 3s up to 90s for confirmation
      const pollStart = Date.now();
      const maxSyncMs = 90000;
      let confirmed = false;
      let lastSubmitTime = Date.now();

      while (Date.now() - pollStart <= maxSyncMs) {
        let syncRes;
        try {
          syncRes = await syncTx(broadcastHash, { privyToken: token });
        } catch {
          syncRes = null;
        }

        if (syncRes && syncRes.ok && syncRes.tx) {
          if (syncRes.tx.status === 'confirmed') {
            setFinalTxRecord(syncRes.tx);
            setFinalStatus('confirmed');
            setStep(7);
            confirmed = true;
            refresh();
            break;
          }
          if (syncRes.tx.status === 'failed') {
            setFinalTxRecord(syncRes.tx);
            setFinalStatus('failed');
            setStep(7);
            confirmed = true;
            refresh();
            break;
          }
        } else if (syncRes && (syncRes.error === 'not_found' || syncRes.error === 'tx_not_found_yet')) {
          // Dalam loop polling 90 detik: jika sync mengembalikan not_found, panggil submit lagi (maksimal sekali tiap 10 detik) sebelum melanjutkan polling
          const now = Date.now();
          if (now - lastSubmitTime >= 10000) {
            lastSubmitTime = now;
            try {
              await submitTx(
                {
                  tx_hash: broadcastHash,
                  asset: selectedAsset,
                  to_pukico_id: resolvedRecipient.id,
                  amount: amountInput,
                },
                { privyToken: token }
              );
            } catch {
              // Ignore background submit retry error and continue polling
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (!confirmed) {
        setFinalStatus('timeout');
        setStep(7);
      }
    } catch (_postHashError) {
      // Error after hash exists: JANGAN tampilkan error. Tampilkan "Sent. We're still checking it."
      setFinalStatus('timeout');
      setStep(7);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 text-left select-none">
      {/* Demo Notice (Flat) */}
      {isDemoMode && (
        <div className="flex items-center gap-1.5 text-xs text-[#B45309]">
          <AlertCircle className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
          <span className="font-semibold">{t.sheets.send.demoNotice}</span>
          <span className="text-[11px] font-normal text-[#B45309]/80">· Base Sepolia</span>
        </div>
      )}

      {/* Prerequisite 1: Wallet Not Verified (Flat) */}
      {isWalletUnverified && (
        <div role="alert" className="flex items-start gap-1.5 text-xs text-[#B45309]">
          <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" />
          <p className="font-medium leading-relaxed">
            {t.sheets.send.walletNotVerified}
          </p>
        </div>
      )}

      {/* Prerequisite 2: Zero ETH for Gas Fee Notice (Flat) */}
      {isEthZero && !isWalletUnverified && (
        <div className="flex items-center justify-between gap-2 text-xs text-[#B45309]">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
            <span className="leading-snug font-medium">{t.sheets.send.needEthForFees}</span>
          </div>
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-medium text-[#0052FF] hover:underline flex items-center gap-1 ml-2"
          >
            <span>{t.sheets.send.getTestEth}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* ================= STEP 1: CHOOSE AN ASSET ================= */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[#0A0B0D]">
              {t.sheets.send.chooseAsset}
            </h3>
          </div>

          <div className="space-y-2 pt-1">
            {/* USDC Row */}
            <button
              type="button"
              disabled={isWalletUnverified}
              onClick={() => {
                setSelectedAsset('USDC');
                setStep(prefilledRecipientId ? 3 : 2);
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-[#E5E7EB] bg-white hover:bg-[#EEF4FF] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EEF4FF] flex items-center justify-center font-bold text-[#0052FF] text-sm">
                  USDC
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-[#0A0B0D]">USD Coin</div>
                  <div className="text-xs text-[#5B6577]">USDC · Base Sepolia</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-bold text-[#0A0B0D]">
                  {formatNumber(usdc.value, { minDecimals: 2, maxDecimals: 2 })} USDC
                </div>
                <div className="text-[11px] text-[#5B6577]">{t.common.testnet}</div>
              </div>
            </button>

            {/* ETH Row */}
            <button
              type="button"
              disabled={isWalletUnverified}
              onClick={() => {
                setSelectedAsset('ETH');
                setStep(prefilledRecipientId ? 3 : 2);
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-[#E5E7EB] bg-white hover:bg-[#EEF4FF] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EEF4FF] flex items-center justify-center font-bold text-[#0052FF] text-sm">
                  ETH
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm text-[#0A0B0D]">Ether</div>
                  <div className="text-xs text-[#5B6577]">ETH · Base Sepolia</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-bold text-[#0A0B0D]">
                  {formatNumber(eth.value, { minDecimals: 2, maxDecimals: 4 })} ETH
                </div>
                <div className="text-[11px] text-[#5B6577]">{t.common.testnet}</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 2: RECIPIENT ================= */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-8 h-8 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center text-[#5B6577] cursor-pointer"
              aria-label={t.sheets.send.backBtn}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-base font-semibold text-[#0A0B0D]">
              {t.sheets.send.whoSendingTo}
            </h3>
          </div>

          <p className="text-xs text-[#5B6577] leading-relaxed">
            {t.sheets.send.enterPukicoIdHelp}
          </p>

          {/* 52px Input with @ prefix */}
          <div className="space-y-2 pt-1">
            <div className="relative flex items-center h-13 bg-white border border-[#E5E7EB] focus-within:border-[#0052FF] focus-within:ring-2 focus-within:ring-[#0052FF]/20 rounded-2xl px-4 transition-all">
              <span className="text-lg font-bold text-[#5B6577] mr-1.5" aria-hidden="true">
                @
              </span>
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={20}
                value={recipientInput}
                onChange={handleRecipientChange}
                placeholder="username"
                className="w-full h-full bg-transparent text-base font-bold text-[#0A0B0D] placeholder:text-[#9CA3AF] placeholder:font-normal focus:outline-none"
                autoFocus
              />
              {recipientStatus === 'looking' && (
                <Loader2 className="w-4 h-4 text-[#0052FF] animate-spin shrink-0 ml-2" />
              )}
              {recipientStatus === 'found' && (
                <div className="w-5 h-5 rounded-full bg-emerald-50 text-[#047857] flex items-center justify-center shrink-0 ml-2">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            {/* Single line status */}
            <div aria-live="polite" className="min-h-[22px] text-xs">
              {recipientStatus === 'looking' && (
                <span className="text-[#5B6577]">{t.sheets.send.lookingUp}</span>
              )}
              {recipientStatus === 'found' && resolvedRecipient && (
                <div className="flex items-center gap-1.5 text-[#047857] font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#047857]" />
                  <span>
                    {t.sheets.send.found} · @{resolvedRecipient.id} ({shortenAddress(resolvedRecipient.address)})
                  </span>
                </div>
              )}
              {recipientStatus === 'not_found' && (
                <span className="text-[#DC2626]">
                  {t.sheets.send.noOneHasId.replace('{id}', recipientInput)}
                </span>
              )}
              {recipientStatus === 'own_id' && (
                <span className="text-[#DC2626]">{t.sheets.send.ownIdError}</span>
              )}
              {recipientStatus === 'format_error' && (
                <span className="text-[#DC2626]">{t.sheets.send.formatError}</span>
              )}
            </div>

            {/* Friends chips (up to 5 recent friends) */}
            {friends.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-semibold text-[#5B6577] mb-2">
                  {t.sheets.send.friendsLabel || 'Friends'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {friends.slice(0, 5).map((f) => (
                    <button
                      key={f.pukico_id}
                      type="button"
                      onClick={() => handleSelectFriendChip(f.pukico_id)}
                      className="px-2.5 py-1 text-xs font-mono font-medium rounded-full bg-[#F3F4F6] hover:bg-[#EEF4FF] text-[#0A0B0D] hover:text-[#0052FF] transition-colors cursor-pointer"
                    >
                      @{f.pukico_id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              disabled={recipientStatus !== 'found' || !resolvedRecipient}
              onClick={() => setStep(3)}
              className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center cursor-pointer"
            >
              {t.sheets.send.continueBtn}
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 3: AMOUNT ================= */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(prefilledRecipientId ? 1 : 2)}
              className="w-8 h-8 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center text-[#5B6577] cursor-pointer"
              aria-label={t.sheets.send.backBtn}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-base font-semibold text-[#0A0B0D]">
              {t.sheets.send.howMuch}
            </h3>
          </div>

          {/* Balance display + Max button */}
          <div className="flex items-center justify-between text-xs text-[#5B6577] py-1 border-b border-[#E5E7EB]">
            <span>
              {t.sheets.send.balanceLabel
                .replace(
                  '{amount}',
                  selectedAsset === 'USDC'
                    ? formatNumber(usdc.value, { minDecimals: 2, maxDecimals: 2 })
                    : formatNumber(eth.value, { minDecimals: 2, maxDecimals: 4 })
                )
                .replace('{asset}', selectedAsset)}
            </span>
            <button
              type="button"
              onClick={handleMaxAmount}
              className="px-2 py-0.5 rounded-md bg-[#EEF4FF] hover:bg-[#BFDBFE] text-[#0052FF] font-semibold text-xs transition-colors cursor-pointer"
            >
              {t.sheets.send.maxBtn}
            </button>
          </div>

          {/* Amount input */}
          <div className="space-y-2 pt-1">
            <div className="relative flex items-center h-13 bg-white border border-[#E5E7EB] focus-within:border-[#0052FF] focus-within:ring-2 focus-within:ring-[#0052FF]/20 rounded-2xl px-4 transition-all">
              <input
                type="text"
                inputMode="decimal"
                value={amountInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/,/g, '.');
                  if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                    setAmountInput(val);
                  }
                }}
                placeholder="0.00"
                className="w-full h-full bg-transparent text-xl font-bold font-mono text-[#0A0B0D] placeholder:text-[#9CA3AF] focus:outline-none"
                autoFocus
              />
              <span className="text-sm font-bold text-[#5B6577] shrink-0 ml-2">
                {selectedAsset}
              </span>
            </div>

            {/* Validation & Network fee row */}
            <div className="flex items-center justify-between text-xs min-h-[22px]">
              <div>
                {!amountValidation.valid && amountInput && (
                  <span className="text-[#DC2626]">
                    {amountValidation.errorKey === 'notEnoughAsset'
                      ? t.sheets.send.notEnoughAsset.replace('{asset}', selectedAsset)
                      : amountValidation.errorKey === 'needEthForFees'
                      ? t.sheets.send.needEthForFees
                      : t.sheets.send.enterAmountPlaceholder}
                  </span>
                )}
              </div>

              <div className="text-[#5B6577] text-right font-medium">
                {isEstimatingFee ? (
                  <span>{t.sheets.send.estimating}</span>
                ) : estimatedFeeEth ? (
                  <span>{t.sheets.send.aboutFeeEth.replace('{fee}', estimatedFeeEth)}</span>
                ) : (
                  <span>{t.sheets.send.feeUnavailable}</span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              disabled={!amountValidation.valid}
              onClick={() => {
                setSendFailedBeforeHash(false);
                setStep(4);
              }}
              className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center cursor-pointer"
            >
              {t.sheets.send.continueBtn}
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 4: REVIEW ================= */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSendFailedBeforeHash(false);
                setStep(3);
              }}
              className="w-8 h-8 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center text-[#5B6577] cursor-pointer"
              aria-label={t.sheets.send.backBtn}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h3 className="text-base font-semibold text-[#0A0B0D]">
              {t.sheets.send.review}
            </h3>
          </div>

          {/* Flat Review Rows */}
          <div className="divide-y divide-[#E5E7EB] border-y border-[#E5E7EB] py-1 text-sm">
            {/* To */}
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#5B6577]">{t.sheets.send.toLabel}</span>
              <div className="text-right">
                <span className="font-semibold text-[#0A0B0D]">@{resolvedRecipient?.id}</span>
                <span className="text-xs text-[#5B6577] ml-1.5 font-mono">
                  ({shortenAddress(resolvedRecipient?.address || '')})
                </span>
              </div>
            </div>

            {/* Amount */}
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#5B6577]">{t.sheets.send.amountLabel}</span>
              <span className="font-bold font-mono text-[#0A0B0D]">
                {formatAssetAmount(amountInput, selectedAsset)} {selectedAsset}
              </span>
            </div>

            {/* Network Fee */}
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#5B6577]">{t.sheets.send.networkFee}</span>
              <span className="font-medium text-[#0A0B0D]">
                {isEstimatingFee ? (
                  <span>{t.sheets.send.estimating}</span>
                ) : estimatedFeeEth ? (
                  <span>{t.sheets.send.aboutFeeEth.replace('{fee}', estimatedFeeEth)}</span>
                ) : (
                  <span>{t.sheets.send.feeUnavailable}</span>
                )}
              </span>
            </div>

            {/* Network */}
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#5B6577]">{t.sheets.send.networkLabel}</span>
              <span className="font-medium text-[#0A0B0D]">Base Sepolia · Testnet</span>
            </div>
          </div>

          <p className="text-xs text-[#5B6577] leading-relaxed">
            {t.sheets.send.testnetNotice}
          </p>

          {/* Error Message if send failed before hash was produced */}
          {sendFailedBeforeHash && (
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-[#3B4455] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#5B6577]" />
                <span className="font-medium leading-snug">{t.sheets.send.notSentNoFundsMoved}</span>
              </div>
              <button
                type="button"
                onClick={handleExecuteSend}
                className="shrink-0 font-semibold text-[#0052FF] hover:underline cursor-pointer"
              >
                {t.sheets.send.tryAgainBtn}
              </button>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleExecuteSend}
              className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {sendFailedBeforeHash ? t.sheets.send.tryAgainBtn : t.sheets.send.confirmAndSend}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 6: PROGRESS ================= */}
      {step === 6 && (
        <div className="py-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#EEF4FF] text-[#0052FF] mx-auto flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-[#0A0B0D]">
              {progressState === 'waiting_approval'
                ? t.sheets.send.waitingApproval
                : t.sheets.send.waitingConfirmation}
            </h4>
            {txHash && (
              <p className="text-xs text-[#5B6577] font-mono break-all px-4">
                {shortenAddress(txHash)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ================= STEP 7: FINAL SERVER STATUS ================= */}
      {step === 7 && (
        <div className="py-4 text-center space-y-5">
          {finalStatus === 'confirmed' && (
            <>
              {/* Green checkmark #047857 */}
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#047857] mx-auto flex items-center justify-center">
                <Check className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-[#0A0B0D]">
                  {t.sheets.send.sentSuccess
                    .replace('{amount}', formatAssetAmount(amountInput, selectedAsset))
                    .replace('{asset}', selectedAsset)
                    .replace('{id}', resolvedRecipient?.id || '')}
                </h4>
                <p className="text-xs text-[#5B6577]">
                  {t.sheets.send.confirmedOnBase}
                </p>
              </div>

              {/* View on Basescan link */}
              {(finalTxRecord?.explorer_url || txHash) && (
                <div>
                  <a
                    href={finalTxRecord?.explorer_url || getExplorerUrl(txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0052FF] hover:underline"
                  >
                    <span>{t.sheets.send.viewOnBasescan}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all hover:bg-[#0042D6] active:scale-[0.99] cursor-pointer"
                >
                  {t.sheets.send.doneBtn}
                </button>
              </div>
            </>
          )}

          {finalStatus === 'failed' && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-50 text-[#DC2626] mx-auto flex items-center justify-center">
                <AlertCircle className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-[#0A0B0D]">
                  {t.sheets.send.transferFailed}
                </h4>
              </div>

              {(finalTxRecord?.explorer_url || txHash) && (
                <div>
                  <a
                    href={finalTxRecord?.explorer_url || getExplorerUrl(txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0052FF] hover:underline"
                  >
                    <span>{t.sheets.send.viewOnBasescan}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-12 rounded-2xl bg-[#E5E7EB] text-[#0A0B0D] font-semibold text-sm transition-all hover:bg-[#D1D5DB] cursor-pointer"
                >
                  {t.sheets.send.doneBtn}
                </button>
              </div>
            </>
          )}

          {finalStatus === 'timeout' && (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-50 text-[#D97706] mx-auto flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>

              <div className="space-y-1">
                <h4 className="text-base font-bold text-[#0A0B0D]">
                  {t.sheets.send.stillCheckingTitle}
                </h4>
                <p className="text-xs text-[#5B6577] px-4 leading-relaxed">
                  {t.sheets.send.stillCheckingDesc}
                </p>
              </div>

              {txHash && (
                <div>
                  <a
                    href={getExplorerUrl(txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0052FF] hover:underline"
                  >
                    <span>{t.sheets.send.viewOnBasescan}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all hover:bg-[#0042D6] cursor-pointer"
                >
                  {t.sheets.send.doneBtn}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
