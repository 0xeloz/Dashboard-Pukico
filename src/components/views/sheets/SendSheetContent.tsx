import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Check,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Copy,
  ChevronDown,
  ChevronUp,
  Fingerprint,
} from 'lucide-react';
import { parseUnits, formatUnits, isAddress, encodeFunctionData, erc20Abi } from 'viem';
import { useAuth } from '../../../context/AuthContext';
import { useBalance } from '../../../context/BalanceContext';
import { useTx } from '../../../context/TxContext';
import { useFriends } from '../../../context/FriendsContext';
import { useToast } from '../../../context/ToastContext';
import { useT } from '../../../i18n';
import { publicClient, BASE_SEPOLIA_USDC_ADDRESS } from '../../../lib/viemClient';
import { ENV, CHAIN_CONFIG } from '../../../lib/config';
import {
  formatEthFee,
  formatAssetAmount,
  formatEthBalance,
  formatUsdcUnits,
  formatUsdcString,
} from '../../../lib/formatters';
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
import {
  type AssetType,
  ASSET_DECIMALS,
  LARGE_TRANSFER_THRESHOLD,
  sameAddress,
  checkRecipientAddress,
  fetchExactBalances,
  buildTransferRequest,
  simulateTransfer,
  getGasPriceCeiling,
  type LockedTransfer,
  extractHash,
  isTxHash,
} from '../../../lib/txGuards';
import {
  computeServiceFee,
  computeMaxSendable,
  maxSendableWithFee,
  computeEthRequirement,
  computeGasReserve,
  getDefaultPerTxGasWei,
  getTreasuryAddress,
  getFeeBps,
  isFeeActive,
  isTreasuryAddress,
  formatUnitsTrimmed,
  getPendingFees,
  savePendingFee,
  removePendingFee,
  type PendingFeeRecord,
  saveLastFeeLog,
  getLastFeeLog,
  type FeeLogEntry,
} from '../../../lib/fees';
import { UsdcTokenIcon, EthTokenIcon } from '../../ui/PukicoBrand';

interface SendSheetContentProps {
  onClose: () => void;
  isDemoMode?: boolean;
  onApprovalStateChange?: (isWaiting: boolean) => void;
  prefilledRecipientId?: string | null;
}

type SendStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type PreHashFailureReason = 'user_rejected' | 'insufficient_funds' | 'nonce' | 'rpc' | 'unknown';

interface LockedSummary {
  asset: AssetType;
  amountUnits: bigint;
  feeUnits: bigint;
  totalUnits: bigint;
  recipientId: string;
}

function identifyPreHashFailureReason(err: unknown): PreHashFailureReason {
  if (!err || typeof err !== 'object') {
    return 'unknown';
  }

  const errorObj = err as Record<string, any>;
  const cause = errorObj.cause as Record<string, any> | undefined;

  const code = errorObj.code ?? cause?.code;
  if (code === 4001 || code === 5000 || String(code) === '4001' || String(code) === '5000') {
    return 'user_rejected';
  }

  const name = errorObj.name || cause?.name;
  if (
    name === 'UserRejectedRequestError' ||
    name === 'TransactionRejectedRpcError' ||
    cause?.name === 'UserRejectedRequestError' ||
    cause?.name === 'TransactionRejectedRpcError'
  ) {
    return 'user_rejected';
  }

  const privyErrorCode = errorObj.privyErrorCode || cause?.privyErrorCode;
  if (
    privyErrorCode === 'exited_auth_flow' ||
    privyErrorCode === 'exited_link_flow' ||
    privyErrorCode === 'user_rejected' ||
    privyErrorCode === 'oauth_user_denied'
  ) {
    return 'user_rejected';
  }

  if (privyErrorCode === 'insufficient_balance') {
    return 'insufficient_funds';
  }

  if (name === 'InsufficientFundsError' || cause?.name === 'InsufficientFundsError') {
    return 'insufficient_funds';
  }

  const fullMessage = (
    String(errorObj.shortMessage || '') +
    ' ' +
    String(errorObj.details || '') +
    ' ' +
    String(errorObj.message || '') +
    ' ' +
    String(cause?.shortMessage || '') +
    ' ' +
    String(cause?.details || '') +
    ' ' +
    String(cause?.message || '')
  ).toLowerCase();

  if (
    /insufficient funds/i.test(fullMessage) ||
    /exceeds.*balance/i.test(fullMessage) ||
    /gas required exceeds allowance/i.test(fullMessage)
  ) {
    return 'insufficient_funds';
  }

  if (
    name === 'NonceTooLowError' ||
    cause?.name === 'NonceTooLowError' ||
    /nonce too low/i.test(fullMessage) ||
    /replacement.*underpriced/i.test(fullMessage) ||
    /transaction nonce/i.test(fullMessage)
  ) {
    return 'nonce';
  }

  if (
    code === -32000 ||
    code === -32003 ||
    name === 'RpcError' ||
    cause?.name === 'RpcError' ||
    /network error/i.test(fullMessage) ||
    /failed to fetch/i.test(fullMessage) ||
    /timeout/i.test(fullMessage) ||
    /connection refused/i.test(fullMessage)
  ) {
    return 'rpc';
  }

  return 'unknown';
}

const FAUCET_URL = 'https://portal.cdp.coinbase.com/products/faucet';

export function SendSheetContent({
  onClose,
  isDemoMode = false,
  onApprovalStateChange,
  prefilledRecipientId,
}: SendSheetContentProps) {
  const { t, formatNumber, fmt, lang } = useT();
  const {
    profile,
    getAccessToken,
    sendTransaction,
    revokeBetaAccess,
    enrollMfa,
    hasPasskeyMfa,
    embeddedWalletAddress,
  } = useAuth();
  const {
    usdc,
    eth,
    ethWei,
    usdcRaw,
    refresh: refreshBalanceCtx,
    refreshUntilChanged,
    setOptimisticBalance,
  } = useBalance();
  const { txs } = useTx();
  const { friends } = useFriends();
  const { toast } = useToast();

  const hasBetaAccess = profile?.beta_access === true || profile?.role === 'admin';

  // 1. Passkey requirement for live mode
  const needsPasskey = !isDemoMode && ENV.REQUIRE_PASSKEY && !hasPasskeyMfa;

  // Track passkey activation transition (only when user requested enrollment from this component)
  const enrollRequestedRef = useRef<boolean>(false);
  const prevPasskeyRef = useRef(hasPasskeyMfa);
  useEffect(() => {
    if (!prevPasskeyRef.current && hasPasskeyMfa) {
      if (enrollRequestedRef.current) {
        toast.success(t.toast.passkeyActive);
        enrollRequestedRef.current = false;
      }
    }
    prevPasskeyRef.current = hasPasskeyMfa;
  }, [hasPasskeyMfa, t.toast.passkeyActive, toast]);

  const [step, setStep] = useState<SendStep>(1);
  const [selectedAsset, setSelectedAsset] = useState<AssetType>('USDC');

  // Exact on-chain bigint balances: null means unknown/loading
  const [balances, setBalances] = useState<{ eth: bigint; usdc: bigint } | null>(null);

  const ethValueRef = useRef(eth.value);
  const usdcValueRef = useRef(usdc.value);
  const ethWeiRef = useRef(ethWei);
  const usdcRawRef = useRef(usdcRaw);
  useEffect(() => {
    ethValueRef.current = eth.value;
    usdcValueRef.current = usdc.value;
    ethWeiRef.current = ethWei;
    usdcRawRef.current = usdcRaw;
  }, [eth.value, usdc.value, ethWei, usdcRaw]);

  const loadBalances = useCallback(async () => {
    if (!profile?.wallet_address) return;
    try {
      const res = await fetchExactBalances(profile.wallet_address);
      setBalances(res);
    } catch {
      // If failed, retain previous value.
      // Fallback to BalanceContext raw bigints if available
      if (usdcRawRef.current !== null && ethWeiRef.current !== null) {
        setBalances((prev) => prev ?? { usdc: usdcRawRef.current!, eth: ethWeiRef.current! });
        return;
      }
      // If raw bigints not yet available, fallback to parseable string (canonical)
      const rawUsdc = usdcValueRef.current;
      const rawEth = ethValueRef.current;
      if (rawUsdc !== null && rawEth !== null) {
        try {
          const cleanUsdc = rawUsdc.replace(/,/g, '').replace('<', '').trim();
          const cleanEth = rawEth.replace(/,/g, '').replace('<', '').trim();
          if (cleanUsdc && !isNaN(Number(cleanUsdc)) && cleanEth && !isNaN(Number(cleanEth))) {
            const parsedUsdc = parseUnits(cleanUsdc, 6);
            const parsedEth = parseUnits(cleanEth, 18);
            setBalances((prev) => prev ?? { usdc: parsedUsdc, eth: parsedEth });
          }
        } catch {
          // Keep prior state, never set to 0n
        }
      }
    }
  }, [profile?.wallet_address]);

  useEffect(() => {
    loadBalances();

    let intervalId: number | null = null;
    const startPolling = () => {
      if (intervalId === null) {
        intervalId = window.setInterval(() => {
          if (document.visibilityState === 'visible') {
            loadBalances();
          }
        }, 15000);
      }
    };
    const stopPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadBalances();
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadBalances]);

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
  const [estimatedFeeWei, setEstimatedFeeWei] = useState<bigint | null>(null); // perTxCeilingWei
  const [perTxExpectedWei, setPerTxExpectedWei] = useState<bigint | null>(null); // perTxExpectedWei
  const [isEstimatingFee, setIsEstimatingFee] = useState<boolean>(false);
  const [explicitGasParams, setExplicitGasParams] = useState<{
    mainGasLimit: bigint;
    feeGasLimit: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    perTxCeilingWei: bigint;
    perTxExpectedWei: bigint;
  } | null>(null);
  const [feeFailureReason, setFeeFailureReason] = useState<string | null>(null);

  // Step 4: Large transfer confirmation & security states
  const [largeTransferInput, setLargeTransferInput] = useState<string>('');
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [copiedDetailField, setCopiedDetailField] = useState<string | null>(null);
  const [recipientVerificationError, setRecipientVerificationError] = useState<boolean>(false);
  const [securityError, setSecurityError] = useState<string | null>(null);

  // Step 5 & 6: Execution & Progress
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [progressState, setProgressState] = useState<'waiting_approval' | 'waiting_confirmation' | null>(null);
  const [feeApprovalPending, setFeeApprovalPending] = useState<boolean>(false);
  const [sendFailedBeforeHash, setSendFailedBeforeHash] = useState<boolean>(false);
  const [preHashFailureReason, setPreHashFailureReason] = useState<PreHashFailureReason | null>(null);
  const [txHash, setTxHash] = useState<string>('');
  const [finalTxRecord, setFinalTxRecord] = useState<TxRecord | null>(null);
  const [finalStatus, setFinalStatus] = useState<'confirmed' | 'failed' | 'timeout' | 'no_access' | null>(null);
  const [lockedSummary, setLockedSummary] = useState<LockedSummary | null>(null);
  const [pendingFeeCurrentTx, setPendingFeeCurrentTx] = useState<boolean>(false);
  const [isRetryingPendingFee, setIsRetryingPendingFee] = useState<boolean>(false);

  // Sync pending fee status for the active transaction
  useEffect(() => {
    if (!profile?.wallet_address) return;
    const current = txHash || finalTxRecord?.tx_hash;
    if (!current) {
      setPendingFeeCurrentTx(false);
      return;
    }
    const dueList = getPendingFees(profile.wallet_address);
    setPendingFeeCurrentTx(dueList.some((f) => f.txHash.toLowerCase() === current.toLowerCase()));
  }, [profile?.wallet_address, txHash, finalTxRecord?.tx_hash, step]);

  // Requirement 11: Silent auto-retry for pending fees on mount
  const silentRetryRanRef = useRef<boolean>(false);
  useEffect(() => {
    if (silentRetryRanRef.current || isDemoMode || !profile?.wallet_address || !sendTransaction) return;
    const pendingList = getPendingFees(profile.wallet_address);
    if (!pendingList || pendingList.length === 0) return;

    silentRetryRanRef.current = true;

    (async () => {
      try {
        const freshBals = await fetchExactBalances(profile.wallet_address);
        for (const item of pendingList) {
          const neededFee = BigInt(item.feeUnits);
          const feeGasLimit = item.asset === 'ETH' ? 21000n : 65000n;
          const [feeData, curGasPrice] = await Promise.all([
            (publicClient as any).estimateFeesPerGas().catch(() => null),
            (publicClient as any).getGasPrice().catch(() => null),
          ]);
          const maxFeePerGas = feeData?.maxFeePerGas ?? feeData?.gasPrice ?? curGasPrice ?? 2000000000n;
          const maxPriorityFeePerGas = feeData?.maxPriorityFeePerGas ?? 1000000n;
          const feeCeilingWei = feeGasLimit * maxFeePerGas;

          const neededEthForFee =
            item.asset === 'ETH'
              ? neededFee + (feeCeilingWei * 110n) / 100n
              : (feeCeilingWei * 110n) / 100n;

          const sufficient =
            item.asset === 'USDC'
              ? freshBals.usdc >= neededFee && freshBals.eth >= neededEthForFee
              : freshBals.eth >= neededEthForFee;

          if (!sufficient) continue;

          try {
            const feeGasOpts = {
              gasLimit: feeGasLimit,
              gas: feeGasLimit,
              maxFeePerGas,
              maxPriorityFeePerGas,
            };
            const feeTxRequest = buildTransferRequest(
              item.asset,
              item.treasuryAddress,
              neededFee,
              feeGasOpts
            );
            const feeResult = await sendTransaction(feeTxRequest, {
              address: profile.wallet_address,
              uiOptions: { showWalletUIs: false },
            });
            const extractedFee = extractHash(feeResult);
            if (extractedFee && isTxHash(extractedFee)) {
              removePendingFee(profile.wallet_address, item.txHash);
              toast.removeStoredNotification(`fee-failed:${item.txHash}`);
              const token = getAccessToken ? await getAccessToken().catch(() => null) : null;
              await submitTxWithRetry(
                {
                  tx_hash: item.txHash,
                  asset: item.asset,
                  to_pukico_id: item.recipientId || '',
                  amount: item.amount || '0',
                  fee_tx_hash: extractedFee,
                },
                { privyToken: token }
              );
            }
          } catch (silentErr) {
            console.error('[fee]', {
              attempt: 'silent_retry',
              reason: 'silent_failed',
              message: silentErr instanceof Error ? silentErr.message : String(silentErr),
            });
          }
        }
      } catch (err) {
        console.error('[fee] Silent fee check error', err);
      }
    })();
  }, [profile?.wallet_address, isDemoMode, sendTransaction, getAccessToken, toast]);

  // Requirement 10: Retry paying current pending fee from step 7
  const handleRetryCurrentFee = async () => {
    if (isRetryingPendingFee || !profile?.wallet_address || !sendTransaction) return;
    const currentHash = txHash || finalTxRecord?.tx_hash;
    if (!currentHash) return;

    const feeRecord = getPendingFees(profile.wallet_address).find(
      (f) => f.txHash.toLowerCase() === currentHash.toLowerCase()
    );
    if (!feeRecord) {
      setPendingFeeCurrentTx(false);
      return;
    }

    setIsRetryingPendingFee(true);
    toast.loading(t.toast.feePaying, { id: 'fee-tx-status', title: t.toast.feePaying });

    const neededFee = BigInt(feeRecord.feeUnits);
    const feeGasLimit = feeRecord.asset === 'ETH' ? 21000n : 65000n;
    const [feeData, curGasPrice] = await Promise.all([
      (publicClient as any).estimateFeesPerGas().catch(() => null),
      (publicClient as any).getGasPrice().catch(() => null),
    ]);
    const maxFeePerGas = feeData?.maxFeePerGas ?? feeData?.gasPrice ?? curGasPrice ?? 2000000000n;
    const maxPriorityFeePerGas = feeData?.maxPriorityFeePerGas ?? 1000000n;
    const feeCeilingWei = feeGasLimit * maxFeePerGas;

    const feeGasOpts = {
      gasLimit: feeGasLimit,
      gas: feeGasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };

    // Pre-check fresh on-chain ETH balance before manual retry
    try {
      const freshBals = await fetchExactBalances(profile.wallet_address);
      setBalances(freshBals);

      const neededEthForFee =
        feeRecord.asset === 'ETH'
          ? neededFee + (feeCeilingWei * 110n) / 100n
          : (feeCeilingWei * 110n) / 100n;

      const sufficient =
        feeRecord.asset === 'USDC'
          ? freshBals.usdc >= neededFee && freshBals.eth >= neededEthForFee
          : freshBals.eth >= neededEthForFee;

      if (!sufficient) {
        setFeeFailureReason('insufficient_eth');
        console.error('[fee]', {
          attempt: 0,
          reason: 'insufficient_eth',
          message: t.toast.feeInsufficientEth,
        });
        saveLastFeeLog({
          timestamp: Date.now(),
          attempt: 0,
          reason: 'insufficient_eth',
          message: t.toast.feeInsufficientEth,
          txHash: currentHash,
          asset: feeRecord.asset,
          feeUnits: feeRecord.feeUnits,
        });
        toast.update('fee-tx-status', 'warning', t.toast.feeInsufficientEth, {
          silent: true,
          title: t.history.serviceFee,
        });
        setIsRetryingPendingFee(false);
        return;
      }
    } catch {
      // Allow attempt if balance check failed
    }

    const retryDelays = [0, 1500, 3000];
    let retriedFeeTxHash: string | undefined = undefined;
    let failureReason: string | null = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt - 1]));
      }

      try {
        const feeTxRequest = buildTransferRequest(
          feeRecord.asset,
          feeRecord.treasuryAddress,
          neededFee,
          feeGasOpts
        );
        const feeResult = await sendTransaction(feeTxRequest, {
          address: profile.wallet_address,
          uiOptions: { showWalletUIs: false },
        });
        const extractedFee = extractHash(feeResult);
        if (extractedFee && isTxHash(extractedFee)) {
          retriedFeeTxHash = extractedFee;
          break;
        } else {
          throw new Error('Invalid fee transaction hash returned');
        }
      } catch (err: unknown) {
        const reason = identifyPreHashFailureReason(err);
        console.error('[fee]', {
          attempt,
          reason,
          message: err instanceof Error ? err.message : String(err),
        });
        saveLastFeeLog({
          timestamp: Date.now(),
          attempt,
          reason,
          message: err instanceof Error ? err.message : String(err),
          txHash: currentHash,
          asset: feeRecord.asset,
          feeUnits: feeRecord.feeUnits,
        });
        failureReason = reason;
        if (reason === 'user_rejected') {
          break;
        }
        if (reason === 'insufficient_funds') {
          failureReason = 'insufficient_eth';
          break;
        }
      }
    }

    if (retriedFeeTxHash && isTxHash(retriedFeeTxHash)) {
      toast.update('fee-tx-status', 'success', t.toast.feePaid, {
        silent: true,
        title: t.history.serviceFee,
      });
      removePendingFee(profile.wallet_address, currentHash);
      toast.removeStoredNotification(`fee-failed:${currentHash}`);
      setPendingFeeCurrentTx(false);
      setFeeFailureReason(null);

      try {
        const token = getAccessToken ? await getAccessToken().catch(() => null) : null;
        await submitTxWithRetry(
          {
            tx_hash: currentHash,
            asset: feeRecord.asset,
            to_pukico_id: feeRecord.recipientId || lockedSummary?.recipientId || '',
            amount:
              feeRecord.amount ||
              (lockedSummary
                ? formatUnits(lockedSummary.amountUnits, ASSET_DECIMALS[lockedSummary.asset])
                : '0'),
            fee_tx_hash: retriedFeeTxHash,
          },
          { privyToken: token }
        );
      } catch (resubmitErr) {
        console.error('[fee]', {
          attempt: 'retry_resubmit',
          reason: 'backend_resubmit_failed',
          message: resubmitErr instanceof Error ? resubmitErr.message : String(resubmitErr),
        });
      }
    } else {
      const reasonToSave = failureReason || 'unknown';
      setFeeFailureReason(reasonToSave);
      const errMsg =
        reasonToSave === 'insufficient_eth'
          ? t.toast.feeInsufficientEth
          : t.toast.feeFailed;
      toast.update('fee-tx-status', 'warning', errMsg, {
        silent: true,
        title: t.history.serviceFee,
      });
    }

    setIsRetryingPendingFee(false);
  };

  const handleClose = useCallback(() => {
    setLockedSummary(null);
    onClose();
  }, [onClose]);

  // Double-send prevention lock ref
  const sendInProgressRef = useRef<boolean>(false);

  // Inform parent whether approval is in progress (to prevent backdrop clicks)
  useEffect(() => {
    const isWaiting = progressState === 'waiting_approval' || feeApprovalPending;
    onApprovalStateChange?.(isWaiting);
    return () => {
      onApprovalStateChange?.(false);
    };
  }, [progressState, feeApprovalPending, onApprovalStateChange]);

  const isWalletUnverified = profile?.wallet_verified === false;

  // Fee calculations
  const feeBps = getFeeBps(isDemoMode);
  const isFeeExempt =
    !isFeeActive(isDemoMode) ||
    isTreasuryAddress(profile?.wallet_address, isDemoMode) ||
    isTreasuryAddress(resolvedRecipient?.address, isDemoMode);

  const parseAmountUnits = (val: string, asset: AssetType): bigint => {
    if (!val || val.trim() === '') return 0n;
    try {
      return parseUnits(val.trim(), ASSET_DECIMALS[asset]);
    } catch {
      return 0n;
    }
  };

  const amountUnits = parseAmountUnits(amountInput, selectedAsset);
  const feeUnits = computeServiceFee(amountUnits, feeBps, isFeeExempt, selectedAsset);

  // Single source of truth for required ETH: gas for 1 or 2 transactions (ceiling) + optional ETH transfer and fee
  const perTxGasWei =
    estimatedFeeWei && estimatedFeeWei > 0n
      ? estimatedFeeWei
      : getDefaultPerTxGasWei(selectedAsset);

  const ethRequiredWei = computeEthRequirement({
    asset: selectedAsset,
    amountUnits,
    feeUnits,
    perTxGasWei,
    feeActive: isFeeActive(isDemoMode) && !isFeeExempt,
  });

  // Insufficient ETH check: ONLY when balances is known AND ETH < required
  const isInsufficientEth =
    balances !== null && balances.eth < ethRequiredWei;

  // Realistic total expected fee displayed to user: perTxExpectedWei x txCount
  const txCount = isFeeActive(isDemoMode) && !isFeeExempt && feeUnits > 0n ? 2n : 1n;
  const totalExpectedGasWei = perTxExpectedWei ? perTxExpectedWei * txCount : null;
  const estimatedFeeEth = totalExpectedGasWei ? formatEthFee(totalExpectedGasWei) : null;

  // Large transfer threshold check
  const isLargeTransfer = amountUnits >= LARGE_TRANSFER_THRESHOLD[selectedAsset];
  const isLargeConfirmed =
    !isLargeTransfer ||
    largeTransferInput.trim().toLowerCase().replace(/^@/, '') ===
      (resolvedRecipient?.id || '').toLowerCase().replace(/^@/, '');

  // Known recipient check (friend list or prior txs)
  const isKnownRecipient = Boolean(
    resolvedRecipient &&
      (friends.some(
        (f) =>
          f.pukico_id.toLowerCase().replace(/^@/, '') ===
          resolvedRecipient.id.toLowerCase().replace(/^@/, '')
      ) ||
        txs.some(
          (tx) =>
            (tx.to_pukico_id || tx.counterparty || '').toLowerCase().replace(/^@/, '') ===
            resolvedRecipient.id.toLowerCase().replace(/^@/, '')
        ))
  );

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

  // Fee Estimation for a SINGLE transaction:
  // Stores (a) perTxCeilingWei (in estimatedFeeWei) and (b) perTxExpectedWei
  const calculateFee = useCallback(
    async (asset: AssetType, targetAddr?: string, valStr?: string) => {
      setIsEstimatingFee(true);
      try {
        let mainGasLimit = asset === 'ETH' ? 21000n : 65000n;
        let feeGasLimit = asset === 'ETH' ? 21000n : 65000n;

        // Gas limit: pakai publicClient.estimateGas untuk transfer sebenarnya
        // (ke alamat penerima, nilai/ data sesungguhnya) dikali 1,2;
        // jika estimateGas gagal, fallback ke 21000 (ETH) atau 65000 (USDC).
        const sender = profile?.wallet_address as `0x${string}` | undefined;
        const recipient = (targetAddr || resolvedRecipient?.address) as `0x${string}` | undefined;
        const treasury = getTreasuryAddress(isDemoMode) as `0x${string}` | undefined;

        if (sender && recipient && isAddress(recipient)) {
          try {
            let estimated: bigint;
            if (asset === 'ETH') {
              const valUnits = valStr ? parseAmountUnits(valStr, 'ETH') : 0n;
              estimated = await (publicClient as any).estimateGas({
                account: sender,
                to: recipient,
                value: valUnits > 0n ? valUnits : 1n,
              });
            } else {
              const valUnits = valStr ? parseAmountUnits(valStr, 'USDC') : 0n;
              const data = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'transfer',
                args: [recipient, valUnits > 0n ? valUnits : 1000000n],
              });
              estimated = await (publicClient as any).estimateGas({
                account: sender,
                to: BASE_SEPOLIA_USDC_ADDRESS as `0x${string}`,
                data,
              });
            }
            if (estimated && estimated > 0n) {
              mainGasLimit = (estimated * 120n) / 100n;
            }
          } catch {
            mainGasLimit = asset === 'ETH' ? 21000n : 65000n;
          }
        }

        // Transaksi fee: 21000 untuk ETH, estimateGas x 1,2 untuk USDC
        if (asset === 'ETH') {
          feeGasLimit = 21000n;
        } else if (sender && treasury && isAddress(treasury)) {
          try {
            const feeData = encodeFunctionData({
              abi: erc20Abi,
              functionName: 'transfer',
              args: [treasury, 10000n],
            });
            const estFee = await (publicClient as any).estimateGas({
              account: sender,
              to: BASE_SEPOLIA_USDC_ADDRESS as `0x${string}`,
              data: feeData,
            });
            if (estFee && estFee > 0n) {
              feeGasLimit = (estFee * 120n) / 100n;
            }
          } catch {
            feeGasLimit = 65000n;
          }
        }

        // Simpan dua nilai per transaksi:
        // (a) perTxCeilingWei = gasLimit x maxFeePerGas (batas atas, hanya untuk pengecekan syarat saldo, tanpa buffer tambahan 25% karena sudah batas atas)
        // (b) perTxExpectedWei = gasLimit x harga gas saat ini (baseFee/gasPrice dari jaringan, bukan ceiling) untuk ditampilkan ke pengguna sebagai "Sekitar"
        const [feeData, curGasPrice] = await Promise.all([
          (publicClient as any).estimateFeesPerGas().catch(() => null),
          (publicClient as any).getGasPrice().catch(() => null),
        ]);

        const maxFeePerGas = feeData?.maxFeePerGas ?? feeData?.gasPrice ?? curGasPrice ?? 2000000000n;
        const maxPriorityFeePerGas = feeData?.maxPriorityFeePerGas ?? 1000000n;
        const gasPrice = curGasPrice ?? feeData?.gasPrice ?? maxPriorityFeePerGas ?? maxFeePerGas;

        const ceilingWei = mainGasLimit * maxFeePerGas;
        const expectedWei = mainGasLimit * gasPrice;

        setEstimatedFeeWei(ceilingWei);
        setPerTxExpectedWei(expectedWei);

        const params = {
          mainGasLimit,
          feeGasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
          perTxCeilingWei: ceilingWei,
          perTxExpectedWei: expectedWei,
        };
        setExplicitGasParams(params);

        return { ceilingWei, expectedWei, ...params };
      } catch {
        const fallbackGas = asset === 'ETH' ? 21000n : 65000n;
        const fallbackCeiling = fallbackGas * 2000000000n;
        const fallbackExpected = fallbackGas * 2000000000n;
        setEstimatedFeeWei(fallbackCeiling);
        setPerTxExpectedWei(fallbackExpected);
        const params = {
          mainGasLimit: fallbackGas,
          feeGasLimit: fallbackGas,
          maxFeePerGas: 2000000000n,
          maxPriorityFeePerGas: 1000000n,
          perTxCeilingWei: fallbackCeiling,
          perTxExpectedWei: fallbackExpected,
        };
        setExplicitGasParams(params);
        return { ceilingWei: fallbackCeiling, expectedWei: fallbackExpected, ...params };
      } finally {
        setIsEstimatingFee(false);
      }
    },
    [profile?.wallet_address, resolvedRecipient?.address, isDemoMode]
  );

  // Hitung ulang taksiran saat sheet dibuka dan saat aset berganti, bukan setiap perubahan jumlah.
  useEffect(() => {
    calculateFee(selectedAsset, resolvedRecipient?.address);
  }, [selectedAsset, resolvedRecipient?.address, calculateFee]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (resolveDebounceRef.current) window.clearTimeout(resolveDebounceRef.current);
      if (resolveControllerRef.current) resolveControllerRef.current.abort();
    };
  }, []);

  // Validation using bigint directly (no float math), null-aware for loading balances
  const validateAmount = (): { valid: boolean; errorKey?: string } => {
    if (balances === null) {
      return { valid: false, errorKey: 'loadingBalance' };
    }

    if (!amountInput || amountInput.trim() === '') {
      return { valid: false, errorKey: 'enterAmountPlaceholder' };
    }

    if (amountUnits <= 0n) {
      return { valid: false, errorKey: 'enterAmountPlaceholder' };
    }

    if (selectedAsset === 'USDC') {
      const totalNeeded = amountUnits + feeUnits;
      if (totalNeeded > balances.usdc) {
        return { valid: false, errorKey: 'notEnoughAsset' };
      }
      if (isInsufficientEth) {
        return { valid: false, errorKey: 'needEthForFees' };
      }
    } else {
      // ETH: requirement from computeEthRequirement (amount + fee + gasReserve)
      if (balances.eth < ethRequiredWei) {
        return { valid: false, errorKey: 'notEnoughAsset' };
      }
    }

    return { valid: true };
  };

  const amountValidation = validateAmount();

  // Max Button handler leaving room for service fee and ETH gas
  const handleMaxAmount = async () => {
    if (!balances) return;

    // Bila taksiran gas belum tersedia saat Maks ditekan, tunggu/hitung dulu (isEstimatingFee) sebelum mengisi jumlah, jangan memakai nilai default 2 gwei.
    let ceilingWei = estimatedFeeWei;
    if (ceilingWei === null || ceilingWei === 0n || isEstimatingFee) {
      const res = await calculateFee(selectedAsset, resolvedRecipient?.address, amountInput);
      ceilingWei = res.ceilingWei;
    }
    if (!ceilingWei || ceilingWei === 0n) {
      ceilingWei = getDefaultPerTxGasWei(selectedAsset);
    }

    const feeActive = isFeeActive(isDemoMode) && !isFeeExempt;

    if (selectedAsset === 'USDC') {
      let maxUnits = computeMaxSendable(balances.usdc, feeBps, 0n, isFeeExempt, 'USDC');
      let full = formatUnits(maxUnits, 6);
      let [intP, decP = ''] = full.split('.');
      let formatted = `${intP}.${decP.padEnd(2, '0').slice(0, 2)}`;
      let parsed = parseAmountUnits(formatted, 'USDC');

      // Verifikasi dengan computeEthRequirement <= saldo ETH dan total USDC <= saldo USDC
      // Kurangi jumlah (langkah 0,01 untuk USDC = 10000 units) sampai lolos atau 0
      while (parsed > 0n) {
        const fee = computeServiceFee(parsed, feeBps, isFeeExempt, 'USDC');
        const reqEth = computeEthRequirement({
          asset: 'USDC',
          amountUnits: parsed,
          feeUnits: fee,
          perTxGasWei: ceilingWei,
          feeActive,
        });

        if (reqEth <= balances.eth && parsed + fee <= balances.usdc) {
          break;
        }

        if (parsed <= 10000n) {
          parsed = 0n;
          formatted = '0.00';
          break;
        }

        parsed -= 10000n;
        const nextFull = formatUnits(parsed, 6);
        const [nextIp, nextDp = ''] = nextFull.split('.');
        formatted = `${nextIp}.${nextDp.padEnd(2, '0').slice(0, 2)}`;
        parsed = parseAmountUnits(formatted, 'USDC');
      }

      setAmountInput(formatted);
    } else {
      const initialTxCount = feeActive ? 2n : 1n;
      const initialGasReserve = computeGasReserve(ceilingWei, initialTxCount);
      let maxUnits = computeMaxSendable(balances.eth, feeBps, initialGasReserve, isFeeExempt, 'ETH');

      let formatted = formatUnitsTrimmed(maxUnits, 18, 8);
      let parsed = parseAmountUnits(formatted, 'ETH');

      // Verifikasi dengan computeEthRequirement(amount, computeServiceFee(amount), perTxGasWei, feeActive) <= saldo ETH;
      // bila belum lolos, kurangi jumlah (langkah 1 unit untuk ETH) sampai lolos atau 0.
      while (parsed > 0n) {
        const fee = computeServiceFee(parsed, feeBps, isFeeExempt, 'ETH');
        const reqEth = computeEthRequirement({
          asset: 'ETH',
          amountUnits: parsed,
          feeUnits: fee,
          perTxGasWei: ceilingWei,
          feeActive,
        });

        if (reqEth <= balances.eth) {
          break;
        }

        // Reduce amount step by step until passing or 0
        const diff = reqEth - balances.eth;
        // In 8-decimal representation, the step is 10^10 wei (0.00000001 ETH)
        const step = diff > 10000000000n ? diff : 10000000000n;
        if (parsed <= step) {
          parsed = 0n;
          formatted = '0';
          break;
        }

        parsed -= step;
        formatted = formatUnitsTrimmed(parsed, 18, 8);
        parsed = parseAmountUnits(formatted, 'ETH');
      }

      setAmountInput(formatted);
    }
  };

  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/,/g, '.');
    val = val.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) {
      val = parts[0] + '.' + parts.slice(1).join('');
    }
    const maxDecimals = selectedAsset === 'USDC' ? 2 : 18;
    if (val.includes('.')) {
      const [integerPart, decimalPart] = val.split('.');
      val = `${integerPart}.${decimalPart.slice(0, maxDecimals)}`;
    }
    setAmountInput(val);
  };

  const handleCopyDetail = async (text: string, fieldId: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDetailField(fieldId);
      toast.info(t.toast.copied, { silent: true });
      setTimeout(() => {
        setCopiedDetailField((prev) => (prev === fieldId ? null : prev));
      }, 1500);
    } catch {
      // Fallback
    }
  };

  // Step 5: Execute Transaction (11-step sequential security sequence)
  const handleExecuteSend = async () => {
    // 1. Anti-double-send lock with useRef
    if (sendInProgressRef.current || isSubmitting) return;
    if (!resolvedRecipient || !hasBetaAccess || !profile?.wallet_address) return;

    sendInProgressRef.current = true;
    setIsSubmitting(true);
    setProgressState('waiting_approval');
    setFeeApprovalPending(false);
    setSendFailedBeforeHash(false);
    setPreHashFailureReason(null);
    setRecipientVerificationError(false);
    setSecurityError(null);

    // 2. Passkey gate
    if (needsPasskey) {
      setSecurityError(t.sheets.send.securityPasskeyRequired);
      setStep(1);
      setIsSubmitting(false);
      setProgressState(null);
      sendInProgressRef.current = false;
      return;
    }

    // 3. Large transfer check
    if (isLargeTransfer && !isLargeConfirmed) {
      setSecurityError(t.sheets.send.largeTransferPrompt.replace('{id}', resolvedRecipient.id));
      setIsSubmitting(false);
      setProgressState(null);
      sendInProgressRef.current = false;
      return;
    }

    // 4. Freeze snapshot LockedTransfer (execution only reads this snapshot)
    const currentSummary: LockedSummary = lockedSummary ?? {
      asset: selectedAsset,
      amountUnits,
      feeUnits,
      totalUnits: amountUnits + feeUnits,
      recipientId: resolvedRecipient.id,
    };
    if (!lockedSummary) {
      setLockedSummary(currentSummary);
    }

    const snapshot: LockedTransfer = {
      asset: currentSummary.asset,
      amountUnits: currentSummary.amountUnits,
      feeUnits: currentSummary.feeUnits,
      recipientId: currentSummary.recipientId,
      recipientAddress: resolvedRecipient.address as `0x${string}`,
      treasuryAddress: getTreasuryAddress(isDemoMode),
      senderAddress: profile.wallet_address as `0x${string}`,
      timestamp: Date.now(),
    };

    // 5. Ensure embeddedWalletAddress matches profile.wallet_address
    if (embeddedWalletAddress && !sameAddress(embeddedWalletAddress, snapshot.senderAddress)) {
      setSecurityError(t.sheets.send.securityBlockedWalletMismatch);
      setStep(4);
      setIsSubmitting(false);
      setProgressState(null);
      sendInProgressRef.current = false;
      return;
    }

    // 6. Re-resolve recipient Pukico ID with fresh token. Address must match snapshot.
    try {
      const freshToken = getAccessToken ? await getAccessToken().catch(() => null) : null;
      const latestResolve = await resolvePukicoId(snapshot.recipientId, {
        privyToken: freshToken,
        isDemoMode,
      });

      if (
        !latestResolve ||
        !latestResolve.found ||
        !latestResolve.wallet_address ||
        !sameAddress(latestResolve.wallet_address, snapshot.recipientAddress)
      ) {
        setRecipientVerificationError(true);
        toast.error(t.toast.recipientUnverified);
        setStep(4);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
    } catch {
      setRecipientVerificationError(true);
      toast.error(t.toast.recipientUnverified);
      setStep(4);
      setIsSubmitting(false);
      setProgressState(null);
      sendInProgressRef.current = false;
      return;
    }

    // 7. checkRecipientAddress (block zero, dead, self, USDC contract)
    const addrCheck = checkRecipientAddress(snapshot.recipientAddress, snapshot.senderAddress);
    if (!addrCheck.valid) {
      setSecurityError(t.sheets.send.securityBlockedUnsafeAddress);
      setStep(4);
      setIsSubmitting(false);
      setProgressState(null);
      sendInProgressRef.current = false;
      return;
    }

    // 8. Read latest on-chain balance and verify balance with computeEthRequirement (syarat A)
    let freshBals: { eth: bigint; usdc: bigint };
    try {
      freshBals = await fetchExactBalances(snapshot.senderAddress);
      setBalances(freshBals);
    } catch {
      freshBals = balances ?? { eth: 0n, usdc: 0n };
    }

    // Explicit gas parameters calculated once and shared across transactions
    const activeGasParams =
      explicitGasParams ??
      (await calculateFee(snapshot.asset, snapshot.recipientAddress, amountInput));

    const currentPerTxGas = activeGasParams.perTxCeilingWei;

    const freshEthRequired = computeEthRequirement({
      asset: snapshot.asset,
      amountUnits: snapshot.amountUnits,
      feeUnits: snapshot.feeUnits,
      perTxGasWei: currentPerTxGas,
      feeActive: isFeeActive(isDemoMode) && !isFeeExempt,
    });

    if (snapshot.asset === 'USDC') {
      if (snapshot.amountUnits + snapshot.feeUnits > freshBals.usdc) {
        setSecurityError(t.sheets.send.notEnoughAsset.replace('{asset}', 'USDC'));
        toast.error(t.toast.insufficientFunds);
        setStep(3);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
      if (freshBals.eth < freshEthRequired) {
        setSecurityError(t.sheets.send.needEthForFees);
        toast.error(t.toast.insufficientFunds);
        setStep(3);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
    } else {
      if (freshBals.eth < freshEthRequired) {
        setSecurityError(t.sheets.send.notEnoughAsset.replace('{asset}', 'ETH'));
        toast.error(t.toast.insufficientFunds);
        setStep(3);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
    }

    // 9. Simulate transfer and check ETH gas reserve
    const mainGasOpts = {
      gasLimit: activeGasParams.mainGasLimit,
      gas: activeGasParams.mainGasLimit,
      maxFeePerGas: activeGasParams.maxFeePerGas,
      maxPriorityFeePerGas: activeGasParams.maxPriorityFeePerGas,
    };

    const mainTxRequest = buildTransferRequest(
      snapshot.asset,
      snapshot.recipientAddress,
      snapshot.amountUnits,
      mainGasOpts
    );

    if (!isDemoMode) {
      try {
        await simulateTransfer(
          publicClient as any,
          snapshot.senderAddress,
          mainTxRequest
        );

        if (freshBals.eth < freshEthRequired) {
          setSecurityError(t.sheets.send.insufficientFundsOrGas);
          toast.error(t.toast.insufficientFunds);
          setStep(3);
          setIsSubmitting(false);
          setProgressState(null);
          sendInProgressRef.current = false;
          return;
        }
      } catch (_simErr) {
        setSecurityError(t.sheets.send.securitySimulationFailed);
        toast.error(t.toast.simulationFailed);
        setStep(4);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
    }

    // Demo Mode flow
    if (isDemoMode) {
      toast.info(t.toast.waitingConfirmation, {
        silent: true,
        title: t.toast.transferSent,
      });
      setStep(6);
      setProgressState('waiting_confirmation');

      // If fee active, demonstrate fee step briefly
      if (snapshot.feeUnits > 0n && snapshot.treasuryAddress) {
        setFeeApprovalPending(true);
        await new Promise((r) => setTimeout(r, 600));
        setFeeApprovalPending(false);
        toast.info(t.toast.feePaid, { silent: true });
      }

      const canonicalAmount = formatUnits(
        snapshot.amountUnits,
        ASSET_DECIMALS[snapshot.asset]
      );

      setStep(7);
      setFinalStatus('confirmed');
      toast.success(t.toast.transferConfirmed, { silent: true });
      setFinalTxRecord({
        tx_hash: '0xdemo1111111111111111111111111111111111111111111111111111111111111111',
        asset: snapshot.asset,
        amount: canonicalAmount,
        to_pukico_id: snapshot.recipientId,
        status: 'confirmed',
        explorer_url: 'https://sepolia.basescan.org',
      });
      setIsSubmitting(false);
      setProgressState(null);
      sendInProgressRef.current = false;
      return;
    }

    let broadcastHash = '';

    // 10. Prompt wallet transaction for main transfer
    toast.loading(t.toast.sending, { id: 'send-tx-status', title: t.toast.sending });

    try {
      if (!sendTransaction) {
        throw new Error('Wallet transaction provider not available.');
      }

      const result = await sendTransaction(mainTxRequest, {
        address: profile.wallet_address,
        uiOptions: { showWalletUIs: false },
      });

      const extracted = extractHash(result);
      if (!extracted || !isTxHash(extracted)) {
        throw new Error('Invalid transaction hash returned.');
      }
      broadcastHash = extracted;
    } catch (errBeforeHash) {
      const reason = identifyPreHashFailureReason(errBeforeHash);
      setSendFailedBeforeHash(true);
      setPreHashFailureReason(reason);
      setProgressState(null);
      setIsSubmitting(false);
      sendInProgressRef.current = false;
      if (reason === 'user_rejected') {
        toast.update('send-tx-status', 'info', t.toast.sendCancelled);
      } else if (reason === 'insufficient_funds') {
        toast.update('send-tx-status', 'error', t.toast.insufficientFunds);
      } else {
        toast.update('send-tx-status', 'error', t.toast.transferFailed);
      }
      return;
    }

    // 11. Valid hash exists - execute second fee transaction and backend tracking
    toast.update('send-tx-status', 'info', t.toast.waitingConfirmation, {
      silent: true,
      title: t.toast.transferSent,
    });
    setTxHash(broadcastHash);
    setProgressState('waiting_confirmation');
    setStep(6);

    // Optimistically deduct balance immediately on broadcast hash
    setOptimisticBalance({
      asset: snapshot.asset,
      amountUnits: snapshot.amountUnits,
      feeUnits: snapshot.feeUnits,
      estimatedGasWei: estimatedFeeWei ?? (snapshot.asset === 'ETH' ? 21000n * 2000000000n : 65000n * 2000000000n),
    });

    const canonicalAmount = formatUnits(
      snapshot.amountUnits,
      ASSET_DECIMALS[snapshot.asset]
    );

    // Save pending tx locally
    savePendingTx({
      tx_hash: broadcastHash,
      asset: snapshot.asset,
      to_pukico_id: snapshot.recipientId,
      amount: canonicalAmount,
    });

    const token = getAccessToken ? await getAccessToken().catch(() => null) : null;

    // ALUR 1: Segera submit ke backend tanpa fee_tx_hash
    let initialSubmitRes;
    try {
      initialSubmitRes = await submitTxWithRetry(
        {
          tx_hash: broadcastHash,
          asset: snapshot.asset,
          to_pukico_id: snapshot.recipientId,
          amount: canonicalAmount,
        },
        { privyToken: token }
      );
    } catch (e) {
      console.error('[tx] Initial submit error (will be polled)', e);
    }

    if (initialSubmitRes && !initialSubmitRes.ok && initialSubmitRes.error === 'no_access') {
      revokeBetaAccess();
      toast.error(t.toast.betaAccessRevoked);
      setIsSubmitting(false);
      setProgressState(null);
      setFinalStatus('no_access');
      setStep(7);
      sendInProgressRef.current = false;
      return;
    }

    // ALUR 2, 3, 4, 5: Biaya layanan
    let feeTxHash: string | undefined = undefined;
    const isFeeEligible = snapshot.feeUnits > 0n && Boolean(snapshot.treasuryAddress);

    if (isFeeEligible) {
      setFeeApprovalPending(true);
      toast.loading(t.toast.feePaying, { id: 'fee-tx-status', title: t.toast.feePaying });

      // ALUR 2: Tunggu receipt transfer utama dengan publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
      try {
        await (publicClient as any).waitForTransactionReceipt({
          hash: broadcastHash as `0x${string}`,
          timeout: 60000,
        });
      } catch (receiptErr) {
        console.error('[fee]', {
          attempt: 0,
          reason: 'wait_receipt_timeout_or_error',
          error: receiptErr instanceof Error ? receiptErr.message : String(receiptErr),
        });
      }

      // Check fresh on-chain balance before attempting fee
      // Requirement C:
      // Untuk fee ETH: butuh feeUnits + perTxCeilingWei x 110 / 100;
      // untuk fee USDC: butuh perTxCeilingWei x 110 / 100 ETH.
      const freshAfterMain = await fetchExactBalances(snapshot.senderAddress).catch(() => freshBals);
      setBalances(freshAfterMain);

      const feeCeilingWei = activeGasParams.feeGasLimit * activeGasParams.maxFeePerGas;
      const neededEthForFee =
        snapshot.asset === 'ETH'
          ? snapshot.feeUnits + (feeCeilingWei * 110n) / 100n
          : (feeCeilingWei * 110n) / 100n;

      const hasEnoughForFee =
        snapshot.asset === 'USDC'
          ? freshAfterMain.usdc >= snapshot.feeUnits && freshAfterMain.eth >= neededEthForFee
          : freshAfterMain.eth >= neededEthForFee;

      if (!hasEnoughForFee) {
        setFeeApprovalPending(false);
        const failureReason = 'insufficient_eth';
        setFeeFailureReason(failureReason);
        console.error('[fee]', {
          attempt: 0,
          reason: failureReason,
          message: t.toast.feeInsufficientEth,
        });
        saveLastFeeLog({
          timestamp: Date.now(),
          attempt: 0,
          reason: failureReason,
          message: t.toast.feeInsufficientEth,
          txHash: broadcastHash,
          asset: snapshot.asset,
          feeUnits: snapshot.feeUnits.toString(),
        });
        savePendingFee(profile.wallet_address, {
          txHash: broadcastHash,
          asset: snapshot.asset,
          feeUnits: snapshot.feeUnits.toString(),
          treasuryAddress: snapshot.treasuryAddress!,
          createdAt: Date.now(),
          recipientId: snapshot.recipientId,
          amount: canonicalAmount,
          reason: failureReason,
        });
        toast.update('fee-tx-status', 'warning', t.toast.feeInsufficientEth, {
          title: t.history.serviceFee,
          id: `fee-failed:${broadcastHash}`,
          dedupeKey: `fee-failed:${broadcastHash}`,
        });
        setPendingFeeCurrentTx(true);
      } else {
        // ALUR 3: Kirim transaksi fee dengan retry: maksimal 3 percobaan, jeda 1500 ms lalu 3000 ms.
        const retryDelays = [0, 1500, 3000];
        let failureReason: string | null = null;

        const feeGasOpts = {
          gasLimit: activeGasParams.feeGasLimit,
          gas: activeGasParams.feeGasLimit,
          maxFeePerGas: activeGasParams.maxFeePerGas,
          maxPriorityFeePerGas: activeGasParams.maxPriorityFeePerGas,
        };

        for (let attempt = 1; attempt <= 3; attempt++) {
          if (attempt > 1) {
            const delay = retryDelays[attempt - 1];
            await new Promise((r) => setTimeout(r, delay));
          }

          try {
            const feeTxRequest = buildTransferRequest(
              snapshot.asset,
              snapshot.treasuryAddress!,
              snapshot.feeUnits,
              feeGasOpts
            );
            const feeResult = await sendTransaction(feeTxRequest, {
              address: profile.wallet_address,
              uiOptions: { showWalletUIs: false },
            });
            const extractedFee = extractHash(feeResult);
            if (extractedFee && isTxHash(extractedFee)) {
              feeTxHash = extractedFee;
              break;
            } else {
              throw new Error('Invalid fee transaction hash returned');
            }
          } catch (err: unknown) {
            const reason = identifyPreHashFailureReason(err);
            console.error('[fee]', {
              attempt,
              reason,
              message: err instanceof Error ? err.message : String(err),
            });
            saveLastFeeLog({
              timestamp: Date.now(),
              attempt,
              reason,
              message: err instanceof Error ? err.message : String(err),
              txHash: broadcastHash,
              asset: snapshot.asset,
              feeUnits: snapshot.feeUnits.toString(),
            });
            failureReason = reason;
            if (reason === 'user_rejected') {
              break; // Jangan retry jika error adalah penolakan pengguna
            }
            if (reason === 'insufficient_funds') {
              failureReason = 'insufficient_eth';
              break; // Jangan retry jika dana tidak cukup
            }
          }
        }

        setFeeApprovalPending(false);

        // ALUR 4: Jika fee berhasil (hash valid): submit ulang ke backend dengan fee_tx_hash
        if (feeTxHash && isTxHash(feeTxHash)) {
          toast.update('fee-tx-status', 'success', t.toast.feePaid, {
            silent: true,
            title: t.history.serviceFee,
          });
          removePendingFee(profile.wallet_address, broadcastHash);
          toast.removeStoredNotification(`fee-failed:${broadcastHash}`);
          setPendingFeeCurrentTx(false);
          setFeeFailureReason(null);

          try {
            const freshToken = getAccessToken ? await getAccessToken().catch(() => null) : null;
            await submitTxWithRetry(
              {
                tx_hash: broadcastHash,
                asset: snapshot.asset,
                to_pukico_id: snapshot.recipientId,
                amount: canonicalAmount,
                fee_tx_hash: feeTxHash,
              },
              { privyToken: freshToken }
            );
          } catch (resubmitErr) {
            console.error('[fee]', {
              attempt: 'fee_resubmit',
              reason: 'backend_resubmit_failed',
              message: resubmitErr instanceof Error ? resubmitErr.message : String(resubmitErr),
            });
          }
        } else {
          // ALUR 5 & 9: Gagal setelah retry: simpan catatan fee tertunda & update toast warning
          const reasonToSave = failureReason || 'unknown';
          setFeeFailureReason(reasonToSave);
          const errMsg =
            reasonToSave === 'insufficient_eth'
              ? t.toast.feeInsufficientEth
              : t.toast.feeFailed;

          toast.update('fee-tx-status', 'warning', errMsg, {
            title: t.history.serviceFee,
            id: `fee-failed:${broadcastHash}`,
            dedupeKey: `fee-failed:${broadcastHash}`,
          });

          savePendingFee(profile.wallet_address, {
            txHash: broadcastHash,
            asset: snapshot.asset,
            feeUnits: snapshot.feeUnits.toString(),
            treasuryAddress: snapshot.treasuryAddress!,
            createdAt: Date.now(),
            recipientId: snapshot.recipientId,
            amount: canonicalAmount,
            reason: reasonToSave,
          });
          setPendingFeeCurrentTx(true);
        }
      }
    }

    try {

      // Poll sync every 3s up to 90s
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

        if (syncRes && !syncRes.ok && syncRes.error === 'no_access') {
          revokeBetaAccess();
          toast.error(t.toast.betaAccessRevoked);
          setIsSubmitting(false);
          setProgressState(null);
          setFinalStatus('no_access');
          setStep(7);
          sendInProgressRef.current = false;
          return;
        }

        if (syncRes && syncRes.ok && syncRes.tx) {
          if (syncRes.tx.status === 'confirmed') {
            setFinalTxRecord(syncRes.tx);
            setFinalStatus('confirmed');
            toast.success(t.toast.transferConfirmed, { silent: true });
            setStep(7);
            confirmed = true;
            refreshUntilChanged(
              snapshot.asset,
              snapshot.asset === 'ETH' ? (balances?.eth ?? ethWei) : (balances?.usdc ?? usdcRaw)
            );
            loadBalances();
            break;
          }
          if (syncRes.tx.status === 'failed') {
            setFinalTxRecord(syncRes.tx);
            setFinalStatus('failed');
            toast.error(t.toast.transferFailed, { silent: true });
            setStep(7);
            confirmed = true;
            refreshUntilChanged(
              snapshot.asset,
              snapshot.asset === 'ETH' ? (balances?.eth ?? ethWei) : (balances?.usdc ?? usdcRaw)
            );
            loadBalances();
            break;
          }
        } else if (syncRes && (syncRes.error === 'not_found' || syncRes.error === 'tx_not_found_yet')) {
          const now = Date.now();
          if (now - lastSubmitTime >= 10000) {
            lastSubmitTime = now;
            try {
              const retryRes = await submitTx(
                {
                  tx_hash: broadcastHash,
                  asset: snapshot.asset,
                  to_pukico_id: snapshot.recipientId,
                  amount: canonicalAmount,
                  fee_tx_hash: feeTxHash,
                },
                { privyToken: token }
              );
              if (!retryRes.ok && retryRes.error === 'no_access') {
                revokeBetaAccess();
                toast.error(t.toast.betaAccessRevoked);
                setIsSubmitting(false);
                setProgressState(null);
                setFinalStatus('no_access');
                setStep(7);
                sendInProgressRef.current = false;
                return;
              }
            } catch {
              // Ignore
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (!confirmed) {
        setFinalStatus('timeout');
        toast.warning(t.toast.transferTimeout);
        setStep(7);
      }
    } catch (_postHashError) {
      setFinalStatus('timeout');
      toast.warning(t.toast.transferTimeout);
      setStep(7);
    } finally {
      setIsSubmitting(false);
      sendInProgressRef.current = false;
    }
  };

  return (
    <div className="space-y-5 text-left select-none">
      {/* Demo Notice */}
      {isDemoMode && (
        <div className="flex items-center gap-1.5 text-xs text-[#B45309]">
          <AlertCircle className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
          <span className="font-semibold">{t.sheets.send.demoNotice}</span>
          <span className="text-[11px] font-normal text-[#B45309]/80">· Base Sepolia</span>
        </div>
      )}

      {/* Prerequisite: Beta Access Inactive */}
      {!hasBetaAccess && (
        <div role="alert" className="flex items-start gap-2 text-xs text-[#B45309] bg-amber-50 border border-amber-200 p-3.5 rounded-xl">
          <AlertCircle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
          <p className="font-semibold leading-relaxed">
            {t.sheets.send.betaAccessRevoked}
          </p>
        </div>
      )}

      {/* Prerequisite 1: Wallet Not Verified */}
      {isWalletUnverified && (
        <div role="alert" className="flex items-start gap-1.5 text-xs text-[#B45309]">
          <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" />
          <p className="font-medium leading-relaxed">
            {t.sheets.send.walletNotVerified}
          </p>
        </div>
      )}

      {/* Prerequisite 2: Insufficient ETH for Gas Fee Notice (Dynamic, only in input amount and review steps) */}
      {isInsufficientEth && !isWalletUnverified && balances !== null && (step === 3 || step === 4) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309]">
          <div className="flex items-start gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" />
            <span className="leading-snug font-medium">
              {(() => {
                const txCount = isFeeActive(isDemoMode) && !isFeeExempt && feeUnits > 0n ? 2n : 1n;
                const template =
                  selectedAsset === 'ETH'
                    ? (txCount === 2n
                        ? t.sheets.send.insufficientEthDetailedEth
                        : t.sheets.send.insufficientEthDetailedEthSingle)
                    : (txCount === 2n
                        ? t.sheets.send.insufficientEthDetailed
                        : t.sheets.send.insufficientEthDetailedSingle);

                return template
                  .replace('{needed}', fmt.ethBalance(ethRequiredWei))
                  .replace('{balance}', fmt.ethBalance(balances.eth));
              })()}
            </span>
          </div>
          {CHAIN_CONFIG.testnet && (
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-semibold text-[#0052FF] hover:underline flex items-center gap-1 self-start sm:self-auto"
            >
              <span>{t.sheets.send.getTestEth}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
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

          {/* Passkey requirement panel for live mode */}
          {needsPasskey ? (
            <div className="p-4 rounded-2xl bg-[#EEF4FF] border border-[#BFDBFE] space-y-3 text-center animate-fade-up">
              <div className="w-12 h-12 rounded-2xl bg-white text-[#0052FF] mx-auto flex items-center justify-center shadow-sm">
                <Fingerprint className="w-6 h-6 stroke-[2.2]" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-[#0A0B0D]">
                  {t.sheets.send.enablePasskeyTitle}
                </h4>
                <p className="text-xs text-[#5B6577] max-w-xs mx-auto leading-relaxed">
                  {t.sheets.send.enablePasskeyDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  enrollRequestedRef.current = true;
                  enrollMfa();
                }}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-[#0052FF] hover:bg-[#0042D6] text-white transition-all shadow-sm active:scale-[0.98] cursor-pointer"
              >
                {t.sheets.send.enablePasskeyBtn}
              </button>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              {/* USDC Row */}
              <button
                type="button"
                disabled={isWalletUnverified || !hasBetaAccess || balances === null}
                onClick={() => {
                  if (!hasBetaAccess || balances === null) return;
                  setLockedSummary(null);
                  setSelectedAsset('USDC');
                  setAmountInput((prev) => {
                    if (prev.includes('.')) {
                      const [intP, decP = ''] = prev.split('.');
                      return `${intP}.${decP.slice(0, 2)}`;
                    }
                    return prev;
                  });
                  setStep(prefilledRecipientId ? 3 : 2);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-[#E5E7EB] bg-white hover:bg-[#EEF4FF] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#EEF4FF] flex items-center justify-center shrink-0">
                    <UsdcTokenIcon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm text-[#0A0B0D]">USD Coin</div>
                    <div className="text-xs text-[#5B6577]">USDC · Base Sepolia</div>
                  </div>
                </div>
                <div className="text-right">
                  {balances === null ? (
                    <div className="h-4 w-20 bg-[#E5E7EB] rounded animate-pulse mb-1" />
                  ) : (
                    <div className="font-mono text-sm font-bold text-[#0A0B0D]">
                      {fmt.usdcUnits(balances.usdc)} USDC
                    </div>
                  )}
                  <div className="text-[11px] text-[#5B6577]">{t.common.testnet}</div>
                </div>
              </button>

              {/* ETH Row */}
              <button
                type="button"
                disabled={isWalletUnverified || !hasBetaAccess || balances === null}
                onClick={() => {
                  if (!hasBetaAccess || balances === null) return;
                  setSelectedAsset('ETH');
                  setStep(prefilledRecipientId ? 3 : 2);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-[#E5E7EB] bg-white hover:bg-[#EEF4FF] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#EEF4FF] flex items-center justify-center shrink-0">
                    <EthTokenIcon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-sm text-[#0A0B0D]">Ether</div>
                    <div className="text-xs text-[#5B6577]">ETH · Base Sepolia</div>
                  </div>
                </div>
                <div className="text-right">
                  {balances === null ? (
                    <div className="h-4 w-20 bg-[#E5E7EB] rounded animate-pulse mb-1" />
                  ) : (
                    <div className="font-mono text-sm font-bold text-[#0A0B0D]">
                      {fmt.ethBalance(balances.eth)} ETH
                    </div>
                  )}
                  <div className="text-[11px] text-[#5B6577]">{t.common.testnet}</div>
                </div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 2: RECIPIENT ================= */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setLockedSummary(null);
                setStep(1);
              }}
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

            {/* Friends chips */}
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
              disabled={recipientStatus !== 'found' || !resolvedRecipient || !hasBetaAccess}
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
              onClick={() => {
                setLockedSummary(null);
                setStep(prefilledRecipientId ? 1 : 2);
              }}
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
              {balances === null
                ? t.sheets.send.loadingBalance
                : t.sheets.send.balanceLabel
                    .replace(
                      '{amount}',
                      selectedAsset === 'USDC'
                        ? fmt.usdcUnits(balances.usdc)
                        : fmt.ethBalance(balances.eth)
                    )
                    .replace('{asset}', selectedAsset)}
            </span>
            <button
              type="button"
              disabled={balances === null}
              onClick={handleMaxAmount}
              className="px-2 py-0.5 rounded-md bg-[#EEF4FF] hover:bg-[#BFDBFE] text-[#0052FF] font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t.sheets.send.maxBtn}
            </button>
          </div>

          <div className="space-y-2 pt-1">
            <div className="relative flex items-center h-13 bg-white border border-[#E5E7EB] focus-within:border-[#0052FF] focus-within:ring-2 focus-within:ring-[#0052FF]/20 rounded-2xl px-4 transition-all">
              <input
                type="text"
                inputMode="decimal"
                value={lang === 'id' ? amountInput.replace('.', ',') : amountInput}
                onChange={handleAmountInputChange}
                placeholder={lang === 'id' ? '0,00' : '0.00'}
                className="w-full h-full bg-transparent text-xl font-bold font-mono text-[#0A0B0D] placeholder:text-[#9CA3AF] focus:outline-none"
                autoFocus
              />
              <span className="text-sm font-bold text-[#5B6577] shrink-0 ml-2">
                {selectedAsset}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs min-h-[22px]">
              <div>
                {!amountValidation.valid && (
                  <span className="text-[#DC2626]">
                    {amountValidation.errorKey === 'loadingBalance'
                      ? t.sheets.send.loadingBalance
                      : amountValidation.errorKey === 'notEnoughAsset'
                      ? t.sheets.send.notEnoughAsset.replace('{asset}', selectedAsset)
                      : amountValidation.errorKey === 'needEthForFees'
                      ? (isInsufficientEth && balances !== null
                          ? (() => {
                              const txCount = isFeeActive(isDemoMode) && !isFeeExempt && feeUnits > 0n ? 2n : 1n;
                              const template =
                                selectedAsset === 'ETH'
                                  ? (txCount === 2n
                                      ? t.sheets.send.insufficientEthDetailedEth
                                      : t.sheets.send.insufficientEthDetailedEthSingle)
                                  : (txCount === 2n
                                      ? t.sheets.send.insufficientEthDetailed
                                      : t.sheets.send.insufficientEthDetailedSingle);
                              return template
                                .replace('{needed}', fmt.ethBalance(ethRequiredWei))
                                .replace('{balance}', fmt.ethBalance(balances.eth));
                            })()
                          : t.sheets.send.needEthForFees)
                      : amountInput
                      ? t.sheets.send.enterAmountPlaceholder
                      : null}
                  </span>
                )}
              </div>

              <div className="text-[#5B6577] text-right font-medium">
                {isEstimatingFee ? (
                  <span>{t.sheets.send.estimating}</span>
                ) : estimatedFeeEth ? (
                  <span>{t.sheets.send.aboutFeeEth.replace('{fee}', fmt.number(estimatedFeeEth))}</span>
                ) : (
                  <span>{t.sheets.send.feeUnavailable}</span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              disabled={!amountValidation.valid || isInsufficientEth || balances === null || !hasBetaAccess}
              onClick={() => {
                setSendFailedBeforeHash(false);
                setSecurityError(null);
                setLockedSummary({
                  asset: selectedAsset,
                  amountUnits,
                  feeUnits,
                  totalUnits: amountUnits + feeUnits,
                  recipientId: resolvedRecipient?.id || '',
                });
                setStep(4);
              }}
              className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center cursor-pointer"
            >
              {balances === null ? t.sheets.send.loadingBalance : t.sheets.send.continueBtn}
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
                setLockedSummary(null);
                setSendFailedBeforeHash(false);
                setRecipientVerificationError(false);
                setSecurityError(null);
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

          {/* New Recipient Amber Warning */}
          {!isKnownRecipient && resolvedRecipient && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
              <span className="leading-relaxed font-medium">
                {t.sheets.send.newRecipientWarning}
              </span>
            </div>
          )}

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

            {/* Recipient gets / Service Fee / Total Rows */}
            {(() => {
              const reviewAsset = lockedSummary?.asset ?? selectedAsset;
              const reviewAmountUnits = lockedSummary?.amountUnits ?? amountUnits;
              const reviewFeeUnits = lockedSummary?.feeUnits ?? feeUnits;
              const reviewTotalUnits = lockedSummary?.totalUnits ?? (amountUnits + feeUnits);

              return reviewFeeUnits > 0n ? (
                <>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-[#5B6577]">{t.sheets.send.recipientGets}</span>
                    <span className="font-bold font-mono text-[#0A0B0D]">
                      {reviewAsset === 'USDC'
                        ? fmt.usdcUnits(reviewAmountUnits)
                        : fmt.units(reviewAmountUnits, ASSET_DECIMALS[reviewAsset])} {reviewAsset}
                    </span>
                  </div>
                  <div className="py-2 flex items-center justify-between text-xs">
                    <span className="text-[#5B6577] flex items-center gap-1">
                      <span>{t.sheets.send.serviceFee}</span>
                      <span className="text-[10px] text-[#0052FF] font-semibold bg-[#EEF4FF] px-1.5 py-0.5 rounded">
                        {(feeBps / 100).toFixed(1)}%
                      </span>
                    </span>
                    <span className="font-mono text-[#0A0B0D] font-medium">
                      +{reviewAsset === 'USDC'
                        ? fmt.usdcUnits(reviewFeeUnits)
                        : fmt.units(reviewFeeUnits, ASSET_DECIMALS[reviewAsset])} {reviewAsset}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between font-semibold">
                    <span className="text-[#0A0B0D]">{t.sheets.send.totalFromYou}</span>
                    <span className="font-bold font-mono text-[#0052FF]">
                      {reviewAsset === 'USDC'
                        ? fmt.usdcUnits(reviewTotalUnits)
                        : fmt.units(reviewTotalUnits, ASSET_DECIMALS[reviewAsset])} {reviewAsset}
                    </span>
                  </div>
                </>
              ) : (
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-[#5B6577]">{t.sheets.send.amountLabel}</span>
                  <span className="font-bold font-mono text-[#0A0B0D]">
                    {reviewAsset === 'USDC'
                      ? fmt.usdcUnits(reviewAmountUnits)
                      : fmt.asset(amountInput, reviewAsset)} {reviewAsset}
                  </span>
                </div>
              );
            })()}

            {/* Network Fee */}
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-[#5B6577]">{t.sheets.send.networkFee}</span>
              <span className="font-medium text-[#0A0B0D]">
                {isEstimatingFee ? (
                  <span>{t.sheets.send.estimating}</span>
                ) : estimatedFeeEth ? (
                  <span>{t.sheets.send.aboutFeeEth.replace('{fee}', fmt.number(estimatedFeeEth))}</span>
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

          {/* Large Transfer Retype Confirmation */}
          {isLargeTransfer && resolvedRecipient && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-[#B45309] font-bold">
                <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0" />
                <span>{t.sheets.send.largeTransferTitle}</span>
              </div>
              <p className="text-[#B45309] leading-relaxed">
                {t.sheets.send.largeTransferPrompt.replace('{id}', resolvedRecipient.id)}
              </p>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={largeTransferInput}
                onChange={(e) => setLargeTransferInput(e.target.value)}
                placeholder={t.sheets.send.largeTransferInputPlaceholder}
                className="w-full h-10 px-3 bg-white border border-amber-300 rounded-xl font-mono text-xs text-[#0A0B0D] placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          {/* Collapsible Details */}
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="flex items-center justify-between w-full px-3.5 py-2.5 text-xs font-semibold text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
            >
              <span>{t.sheets.send.details}</span>
              {showDetails ? (
                <ChevronUp className="w-4 h-4 text-[#5B6577]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#5B6577]" />
              )}
            </button>

            {showDetails && (
              <div className="px-3.5 pb-3 pt-1 space-y-2.5 border-t border-[#E5E7EB] text-xs">
                {/* 1. Recipient Address */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[#5B6577] text-[11px]">
                    <span>{t.sheets.send.recipientAddress}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyDetail(resolvedRecipient?.address || '', 'recipient')}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0052FF] hover:underline cursor-pointer"
                    >
                      {copiedDetailField === 'recipient' ? (
                        <>
                          <Check className="w-3 h-3 text-[#047857]" />
                          <span className="text-[#047857]">{t.common.copied}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t.common.copy}</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div
                    onClick={() => handleCopyDetail(resolvedRecipient?.address || '', 'recipient')}
                    className="font-mono text-[11px] text-[#0A0B0D] break-all bg-white p-2 rounded-lg border border-[#E5E7EB] cursor-pointer hover:border-[#BFDBFE] transition-colors select-all"
                  >
                    {resolvedRecipient?.address || '—'}
                  </div>
                </div>

                {/* 2. Token contract address (for USDC) */}
                {selectedAsset === 'USDC' && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[#5B6577] text-[11px]">
                      <span>{t.sheets.send.tokenContract}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyDetail(BASE_SEPOLIA_USDC_ADDRESS, 'token_contract')}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0052FF] hover:underline cursor-pointer"
                      >
                        {copiedDetailField === 'token_contract' ? (
                          <>
                            <Check className="w-3 h-3 text-[#047857]" />
                            <span className="text-[#047857]">{t.common.copied}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{t.common.copy}</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div
                      onClick={() => handleCopyDetail(BASE_SEPOLIA_USDC_ADDRESS, 'token_contract')}
                      className="font-mono text-[11px] text-[#0A0B0D] break-all bg-white p-2 rounded-lg border border-[#E5E7EB] cursor-pointer hover:border-[#BFDBFE] transition-colors select-all"
                    >
                      {BASE_SEPOLIA_USDC_ADDRESS}
                    </div>
                  </div>
                )}

                {/* 3. Network ID */}
                <div className="flex items-center justify-between py-1 border-t border-[#E5E7EB]/60">
                  <span className="text-[#5B6577] text-[11px]">{t.sheets.send.networkId}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyDetail(String(CHAIN_CONFIG.id), 'network_id')}
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#0A0B0D] hover:text-[#0052FF] cursor-pointer"
                  >
                    <span>{CHAIN_CONFIG.id}</span>
                    {copiedDetailField === 'network_id' ? (
                      <Check className="w-3 h-3 text-[#047857]" />
                    ) : (
                      <Copy className="w-3 h-3 text-[#9CA3AF]" />
                    )}
                  </button>
                </div>

                {/* 4. Asset */}
                <div className="flex items-center justify-between py-1 border-t border-[#E5E7EB]/60">
                  <span className="text-[#5B6577] text-[11px]">{t.sheets.send.assetLabel}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyDetail(selectedAsset, 'asset')}
                    className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#0A0B0D] hover:text-[#0052FF] cursor-pointer"
                  >
                    <span>{selectedAsset}</span>
                    {copiedDetailField === 'asset' ? (
                      <Check className="w-3 h-3 text-[#047857]" />
                    ) : (
                      <Copy className="w-3 h-3 text-[#9CA3AF]" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-[#5B6577] leading-relaxed">
            {t.sheets.send.testnetNotice}
          </p>

          {/* Inline Security Gate Error */}
          {securityError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#B91C1C] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" />
                <span className="font-medium leading-snug">{securityError}</span>
              </div>
            </div>
          )}

          {/* Error Message if recipient verification failed right before sending */}
          {recipientVerificationError && (
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-[#3B4455] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" />
                <span className="font-medium leading-snug">
                  {t.sheets.send.recipientChangedOrUnverified}
                </span>
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

          {/* Error Message if send failed before hash was produced */}
          {sendFailedBeforeHash && !recipientVerificationError && (
            <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-[#3B4455] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#5B6577]" />
                <span className="font-medium leading-snug">
                  {preHashFailureReason === 'user_rejected'
                    ? t.sheets.send.cancelledTransfer
                    : preHashFailureReason === 'insufficient_funds'
                    ? t.sheets.send.insufficientFundsOrGas
                    : t.sheets.send.notSentNoFundsMoved}
                </span>
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
              disabled={
                isSubmitting ||
                !hasBetaAccess ||
                !amountValidation.valid ||
                isInsufficientEth ||
                balances === null ||
                (isLargeTransfer && !isLargeConfirmed)
              }
              onClick={handleExecuteSend}
              className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {sendFailedBeforeHash || recipientVerificationError
                  ? t.sheets.send.tryAgainBtn
                  : t.sheets.send.confirmAndSend}
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
              {feeApprovalPending
                ? t.sheets.send.step2FeeApproval
                : progressState === 'waiting_approval'
                ? t.sheets.send.waitingApproval
                : t.sheets.send.waitingConfirmation}
            </h4>
            {lockedSummary && (
              <p className="text-xs text-[#5B6577] font-mono">
                {lockedSummary.asset === 'USDC'
                  ? fmt.usdcUnits(lockedSummary.amountUnits)
                  : fmt.units(lockedSummary.amountUnits, ASSET_DECIMALS[lockedSummary.asset], 8)}{' '}
                {lockedSummary.asset} → @{lockedSummary.recipientId}
              </p>
            )}
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
          {finalStatus === 'confirmed' && (() => {
            const displayAsset = lockedSummary?.asset ?? selectedAsset;
            const displayAmount =
              displayAsset === 'USDC'
                ? fmt.usdcUnits(lockedSummary?.amountUnits ?? amountUnits)
                : fmt.units(
                    lockedSummary?.amountUnits ?? amountUnits,
                    ASSET_DECIMALS[displayAsset],
                    8
                  );
            const displayFee =
              displayAsset === 'USDC'
                ? fmt.usdcUnits(lockedSummary?.feeUnits ?? feeUnits)
                : fmt.units(
                    lockedSummary?.feeUnits ?? feeUnits,
                    ASSET_DECIMALS[displayAsset],
                    8
                  );
            const displayTotal =
              displayAsset === 'USDC'
                ? fmt.usdcUnits(lockedSummary?.totalUnits ?? (amountUnits + feeUnits))
                : fmt.units(
                    lockedSummary?.totalUnits ?? (amountUnits + feeUnits),
                    ASSET_DECIMALS[displayAsset],
                    8
                  );
            const displayRecipient = lockedSummary?.recipientId || resolvedRecipient?.id || '';

            return (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-[#047857] mx-auto flex items-center justify-center">
                  <Check className="w-8 h-8 stroke-[2.5]" />
                </div>

                <div className="space-y-1">
                  <h4 className="text-base font-bold text-[#0A0B0D]">
                    {t.sheets.send.sentSuccess
                      .replace('{amount}', displayAmount)
                      .replace('{asset}', displayAsset)
                      .replace('{id}', displayRecipient)}
                  </h4>
                  <p className="text-xs text-[#5B6577]">
                    {t.sheets.send.confirmedOnBase}
                  </p>
                </div>

                {/* Rows: Penerima menerima, Biaya layanan, Total dari kamu */}
                <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl p-3 text-left text-xs space-y-2 max-w-sm mx-auto">
                  <div className="flex items-center justify-between">
                    <span className="text-[#5B6577]">{t.sheets.send.recipientGets}</span>
                    <span className="font-mono font-semibold text-[#0A0B0D]">
                      {displayAmount} {displayAsset}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[#5B6577]">{t.sheets.send.serviceFee}</span>
                    <span className="font-mono font-semibold text-[#0A0B0D]">
                      {displayFee} {displayAsset}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[#E5E7EB]/60 font-semibold">
                    <span className="text-[#0A0B0D]">{t.sheets.send.totalFromYou}</span>
                    <span className="font-mono font-bold text-[#0052FF]">
                      {displayTotal} {displayAsset}
                    </span>
                  </div>

                  {finalTxRecord?.network_fee_wei && (
                    <div className="flex items-center justify-between pt-1 border-t border-[#E5E7EB]/60">
                      <span className="text-[#5B6577]">
                        {t.sheets.send.networkFeeTransfer || t.sheets.send.networkFee}
                      </span>
                      <span className="font-mono font-semibold text-[#0A0B0D]">
                        {fmt.ethFee(finalTxRecord.network_fee_wei)} ETH
                      </span>
                    </div>
                  )}
                </div>

                {/* Pending fee warning row with retry button */}
                {pendingFeeCurrentTx && (
                  <div className="space-y-1.5 max-w-sm mx-auto">
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-[#B45309]">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="w-4 h-4 text-[#B45309] shrink-0" />
                        <span className="font-medium text-left leading-tight">
                          {t.sheets.send.feePendingWarning}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isRetryingPendingFee}
                        onClick={handleRetryCurrentFee}
                        className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-[#78350F] font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isRetryingPendingFee && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>{t.sheets.send.feePendingRetry}</span>
                      </button>
                    </div>
                    {(CHAIN_CONFIG.testnet || isDemoMode) && (
                      (() => {
                        const curHash = txHash || finalTxRecord?.tx_hash;
                        const record =
                          curHash && profile?.wallet_address
                            ? getPendingFees(profile.wallet_address).find(
                                (f) => f.txHash.toLowerCase() === curHash.toLowerCase()
                              )
                            : null;
                        const codeReason = feeFailureReason || record?.reason;
                        if (!codeReason) return null;
                        return (
                          <div className="text-[11px] text-[#5B6577] font-mono text-center">
                            reason: {codeReason}
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}

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
                    onClick={handleClose}
                    className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all hover:bg-[#0042D6] active:scale-[0.99] cursor-pointer"
                  >
                    {t.sheets.send.doneBtn}
                  </button>
                </div>
              </>
            );
          })()}

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
                  onClick={handleClose}
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
                  onClick={handleClose}
                  className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all hover:bg-[#0042D6] cursor-pointer"
                >
                  {t.sheets.send.doneBtn}
                </button>
              </div>
            </>
          )}

          {finalStatus === 'no_access' && (
            <>
              <div className="w-16 h-16 rounded-full bg-amber-50 text-[#D97706] mx-auto flex items-center justify-center">
                <AlertCircle className="w-8 h-8 stroke-[2.5]" />
              </div>

              <div className="space-y-1 px-4">
                <h4 className="text-base font-bold text-[#0A0B0D]">
                  {t.sheets.send.betaAccessRevoked}
                </h4>
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
                  onClick={handleClose}
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
