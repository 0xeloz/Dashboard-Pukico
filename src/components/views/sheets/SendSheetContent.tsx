import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Check,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Loader2,
  ShieldCheck,
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
  formatRelativeTime,
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
import { RecipientVerification } from '../../ui/RecipientVerification';
import { findLookalike, diffChunks } from '../../../lib/addressSafety';
import {
  parseRecipientInput,
  isLikelyAddressInput,
  validateExternalAddress,
  findLookalikeAddress,
  isNewExternalAddress,
  checkIsContract,
} from '../../../lib/externalRecipient';

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
  isExternal?: boolean;
  recipientAddress?: string;
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
    'idle' | 'looking' | 'found' | 'not_found' | 'own_id' | 'format_error' | 'lookup_error'
  >('idle');
  const [resolvedRecipient, setResolvedRecipient] = useState<{
    id: string;
    address: string;
    isExternal?: boolean;
    hasChecksum?: boolean;
  } | null>(null);
  const [recipientAddressChanged, setRecipientAddressChanged] = useState<boolean>(false);
  const [previousRecipientAddress, setPreviousRecipientAddress] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [isAddressChangeAcknowledged, setIsAddressChangeAcknowledged] = useState<boolean>(false);
  const [failedLookupIds, setFailedLookupIds] = useState<Set<string>>(new Set());

  // External recipient states
  const [externalChecksumWarning, setExternalChecksumWarning] = useState<boolean>(false);
  const [externalAddressError, setExternalAddressError] = useState<string | null>(null);
  const [contractStatus, setContractStatus] = useState<'checking' | 'contract' | 'eoa' | 'error' | null>(null);
  const [lookalikeExternalAddress, setLookalikeExternalAddress] = useState<string | null>(null);
  const [isNewAddress, setIsNewAddress] = useState<boolean>(false);
  const [isExtAddressChecked, setIsExtAddressChecked] = useState<boolean>(false);
  const [isExtRiskChecked, setIsExtRiskChecked] = useState<boolean>(false);

  const resolveDebounceRef = useRef<number | null>(null);
  const resolveControllerRef = useRef<AbortController | null>(null);
  const latestResolveReqIdRef = useRef<number>(0);
  const sheetContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sheetContentRef.current) {
      sheetContentRef.current.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [step]);

  useEffect(() => {
    return () => {
      if (resolveDebounceRef.current) {
        window.clearTimeout(resolveDebounceRef.current);
      }
      if (resolveControllerRef.current) {
        resolveControllerRef.current.abort();
      }
    };
  }, []);

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

  const feeActive = isFeeActive(isDemoMode) && !isFeeExempt;
  const ethMinTxCount = feeActive ? 2n : 1n;
  const ethGasNeeded = computeGasReserve(perTxGasWei, ethMinTxCount);
  const isEthBalanceTooLow =
    selectedAsset === 'ETH' && balances !== null && balances.eth <= ethGasNeeded;

  const ethRequiredWei = computeEthRequirement({
    asset: selectedAsset,
    amountUnits,
    feeUnits,
    perTxGasWei,
    feeActive,
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
    (resolvedRecipient?.isExternal
      ? largeTransferInput.trim().toLowerCase() === (resolvedRecipient.address || '').toLowerCase() ||
        largeTransferInput.trim().toLowerCase() === shortenAddress(resolvedRecipient.address || '').toLowerCase()
      : largeTransferInput.trim().toLowerCase().replace(/^@/, '') ===
        (resolvedRecipient?.id || '').toLowerCase().replace(/^@/, ''));

  // Recent recipients derived from confirmed outgoing transactions in txs (max 3, deduplicated, newest first)
  const recentRecipients = useMemo(() => {
    if (!txs || txs.length === 0) return [];
    const myId = (profile?.pukico_id || '').replace(/^@+/, '').trim().toLowerCase();

    const recipientMap = new Map<string, { timestamp: string; timeMs: number }>();

    for (const tx of txs) {
      const rawStatus = (tx.status || '').toLowerCase();
      if (rawStatus !== 'confirmed') continue;

      const isOutgoing =
        tx.direction === 'out' ||
        tx.direction === 'outgoing' ||
        ('type' in tx && (tx as any).type === 'outgoing');

      if (!isOutgoing) continue;

      // External recipients must NEVER enter Recent list
      if (tx.is_external || !tx.counterparty || tx.counterparty.startsWith('0x')) continue;

      const rawRecipient = (tx.to_pukico_id || tx.counterparty || '').replace(/^@+/, '').trim().toLowerCase();
      if (!rawRecipient || rawRecipient === myId) continue;

      const timeVal = tx.confirmed_at || tx.created_at || (tx as any).timestamp || '';
      let timeMs = 0;
      if (timeVal) {
        const num = Number(timeVal);
        if (!isNaN(num) && num > 0) {
          timeMs = num;
        } else {
          const parsed = Date.parse(timeVal);
          timeMs = isNaN(parsed) ? 0 : parsed;
        }
      }

      const existing = recipientMap.get(rawRecipient);
      if (!existing || timeMs > existing.timeMs) {
        recipientMap.set(rawRecipient, { timestamp: timeVal, timeMs });
      }
    }

    const list = Array.from(recipientMap.entries()).map(([id, data]) => ({
      id,
      timestamp: data.timestamp,
      timeMs: data.timeMs,
    }));

    list.sort((a, b) => b.timeMs - a.timeMs);
    return list.slice(0, 3);
  }, [txs, profile?.pukico_id]);

  const recentRecipientIds = useMemo(() => {
    return new Set(recentRecipients.map((r) => r.id.toLowerCase()));
  }, [recentRecipients]);

  const availableFriends = useMemo(() => {
    return friends.filter(
      (f) => !recentRecipientIds.has(f.pukico_id.toLowerCase().replace(/^@+/, '').trim())
    );
  }, [friends, recentRecipientIds]);

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

  const knownRecipientIds = useMemo(() => {
    const ids = new Set<string>();
    friends.forEach((f) => {
      if (f.pukico_id) ids.add(f.pukico_id.toLowerCase().trim().replace(/^@/, ''));
    });
    txs.forEach((tx) => {
      if (tx.direction === 'out' || tx.to_pukico_id) {
        const targetId = tx.to_pukico_id || tx.counterparty;
        if (targetId) ids.add(targetId.toLowerCase().trim().replace(/^@/, ''));
      }
    });
    return Array.from(ids);
  }, [friends, txs]);

  // Known used addresses from outgoing and general txs for address poisoning detection
  const knownUsedAddresses = useMemo(() => {
    const addrs = new Set<string>();
    if (!txs) return [];
    for (const tx of txs) {
      if (tx.counterparty_address) addrs.add(tx.counterparty_address);
      if (tx.to_address) addrs.add(tx.to_address);
      if (tx.counterparty && tx.counterparty.startsWith('0x')) addrs.add(tx.counterparty);
    }
    return Array.from(addrs);
  }, [txs]);

  // Outgoing counterparty addresses for isNewExternalAddress check
  const knownOutgoingAddresses = useMemo(() => {
    const addrs = new Set<string>();
    if (!txs) return [];
    for (const tx of txs) {
      const isOutgoing =
        tx.direction === 'out' ||
        tx.direction === 'outgoing' ||
        ('type' in tx && (tx as any).type === 'outgoing');
      if (isOutgoing) {
        if (tx.counterparty_address) addrs.add(tx.counterparty_address);
        if (tx.to_address) addrs.add(tx.to_address);
        if (tx.counterparty && tx.counterparty.startsWith('0x')) addrs.add(tx.counterparty);
      }
    }
    return Array.from(addrs);
  }, [txs]);

  const lookalikeRecipientId = useMemo(() => {
    if (!resolvedRecipient?.id || isKnownRecipient || resolvedRecipient.isExternal) return null;
    return findLookalike(resolvedRecipient.id, knownRecipientIds);
  }, [resolvedRecipient?.id, isKnownRecipient, resolvedRecipient?.isExternal, knownRecipientIds]);

  // Unified Recipient Lookup Routine (handles debounce, token cancellation, and error differentiation)
  const performLookup = useCallback(
    (rawTargetId: string, debounceMs: number = 0) => {
      if (resolveDebounceRef.current) {
        window.clearTimeout(resolveDebounceRef.current);
        resolveDebounceRef.current = null;
      }
      if (resolveControllerRef.current) {
        resolveControllerRef.current.abort();
        resolveControllerRef.current = null;
      }

      setExternalAddressError(null);
      setExternalChecksumWarning(false);
      setContractStatus(null);
      setLookalikeExternalAddress(null);
      setIsNewAddress(false);
      setIsExtAddressChecked(false);
      setIsExtRiskChecked(false);

      const sanitized = rawTargetId.replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
      setRecipientInput(sanitized);

      if (sanitized.length === 0) {
        setRecipientStatus('idle');
        setResolvedRecipient(null);
        setRecipientAddressChanged(false);
        setPreviousRecipientAddress(null);
        setLastSentAt(null);
        setIsAddressChangeAcknowledged(false);
        return;
      }

      if (sanitized.length < 3) {
        setRecipientStatus('format_error');
        setResolvedRecipient(null);
        setRecipientAddressChanged(false);
        setPreviousRecipientAddress(null);
        setLastSentAt(null);
        setIsAddressChangeAcknowledged(false);
        return;
      }

      // Check if own ID
      if (profile?.pukico_id && sanitized === profile.pukico_id.toLowerCase().replace(/^@/, '')) {
        setRecipientStatus('own_id');
        setResolvedRecipient(null);
        setRecipientAddressChanged(false);
        setPreviousRecipientAddress(null);
        setLastSentAt(null);
        setIsAddressChangeAcknowledged(false);
        return;
      }

      setRecipientStatus('looking');
      const controller = new AbortController();
      resolveControllerRef.current = controller;
      const reqId = ++latestResolveReqIdRef.current;

      const execute = async () => {
        try {
          const token = getAccessToken ? await getAccessToken() : null;
          if (reqId !== latestResolveReqIdRef.current || controller.signal.aborted) {
            return;
          }
          const result = await resolvePukicoId(
            sanitized,
            { privyToken: token, isDemoMode },
            controller.signal
          );

          if (reqId !== latestResolveReqIdRef.current) {
            return;
          }

          if (result.error === 'network' || result.error === 'server') {
            setRecipientStatus('lookup_error');
            setResolvedRecipient(null);
            setRecipientAddressChanged(false);
            setPreviousRecipientAddress(null);
            setLastSentAt(null);
            setIsAddressChangeAcknowledged(false);
            return;
          }

          if (result.is_self) {
            setRecipientStatus('own_id');
            setResolvedRecipient(null);
            setRecipientAddressChanged(false);
            setPreviousRecipientAddress(null);
            setLastSentAt(null);
            setIsAddressChangeAcknowledged(false);
          } else if (result.found && result.wallet_address) {
            setRecipientStatus('found');
            setResolvedRecipient({
              id: result.pukico_id || sanitized,
              address: result.wallet_address,
            });
            setRecipientAddressChanged(Boolean(result.address_changed));
            setPreviousRecipientAddress(result.previous_address || null);
            setLastSentAt(result.last_sent_at || null);
            setIsAddressChangeAcknowledged(false);
            setFailedLookupIds((prev) => {
              if (!prev.has(sanitized)) return prev;
              const next = new Set(prev);
              next.delete(sanitized);
              return next;
            });
          } else if (result.reason === 'format') {
            setRecipientStatus('format_error');
            setResolvedRecipient(null);
            setRecipientAddressChanged(false);
            setPreviousRecipientAddress(null);
            setLastSentAt(null);
            setIsAddressChangeAcknowledged(false);
          } else {
            setRecipientStatus('not_found');
            setResolvedRecipient(null);
            setRecipientAddressChanged(false);
            setPreviousRecipientAddress(null);
            setLastSentAt(null);
            setIsAddressChangeAcknowledged(false);
            setFailedLookupIds((prev) => new Set(prev).add(sanitized));
          }
        } catch (err: unknown) {
          if (reqId === latestResolveReqIdRef.current) {
            if ((err as Error)?.name === 'AbortError') {
              return;
            }
            setRecipientStatus('lookup_error');
            setResolvedRecipient(null);
            setRecipientAddressChanged(false);
            setPreviousRecipientAddress(null);
            setLastSentAt(null);
            setIsAddressChangeAcknowledged(false);
          }
        }
      };

      if (debounceMs > 0) {
        resolveDebounceRef.current = window.setTimeout(execute, debounceMs);
      } else {
        execute();
      }
    },
    [profile?.pukico_id, getAccessToken, isDemoMode]
  );

  // Handle external 0x address validation and security checks
  const handleExternalAddressInput = useCallback(
    (rawInput: string) => {
      if (resolveDebounceRef.current) {
        window.clearTimeout(resolveDebounceRef.current);
        resolveDebounceRef.current = null;
      }
      if (resolveControllerRef.current) {
        resolveControllerRef.current.abort();
        resolveControllerRef.current = null;
      }

      const parsed = parseRecipientInput(rawInput);
      setRecipientInput(parsed.sanitized);

      setRecipientAddressChanged(false);
      setPreviousRecipientAddress(null);
      setLastSentAt(null);
      setIsAddressChangeAcknowledged(false);

      if (parsed.sanitized.length < 42) {
        setRecipientStatus('format_error');
        setExternalAddressError(t.sheets.send.addressIncomplete);
        setResolvedRecipient(null);
        setExternalChecksumWarning(false);
        setContractStatus(null);
        setLookalikeExternalAddress(null);
        setIsNewAddress(false);
        setIsExtAddressChecked(false);
        setIsExtRiskChecked(false);
        return;
      }

      const validation = validateExternalAddress(parsed.sanitized, profile?.wallet_address);
      if (!validation.valid) {
        setRecipientStatus('format_error');
        setResolvedRecipient(null);
        setExternalChecksumWarning(false);
        setContractStatus(null);
        setLookalikeExternalAddress(null);
        setIsNewAddress(false);
        setIsExtAddressChecked(false);
        setIsExtRiskChecked(false);

        if (validation.reason === 'invalid_checksum') {
          setExternalAddressError(t.sheets.send.invalidChecksum);
        } else if (validation.reason === 'zero') {
          setExternalAddressError(t.sheets.send.zeroAddressError);
        } else if (validation.reason === 'dead') {
          setExternalAddressError(t.sheets.send.deadAddressError);
        } else if (validation.reason === 'self') {
          setExternalAddressError(t.sheets.send.selfAddressError);
        } else if (validation.reason === 'usdc_contract') {
          setExternalAddressError(t.sheets.send.usdcContractError);
        } else {
          setExternalAddressError(t.sheets.send.formatError);
        }
        return;
      }

      // Valid external address
      setExternalAddressError(null);
      setRecipientStatus('found');
      setExternalChecksumWarning(!validation.hasChecksum);
      setResolvedRecipient({
        id: '',
        address: validation.address,
        isExternal: true,
        hasChecksum: validation.hasChecksum,
      });

      // Address poisoning check: 4 hex prefix and 4 hex suffix match known used address but full address differs
      const lookalike = findLookalikeAddress(validation.address, knownUsedAddresses);
      setLookalikeExternalAddress(lookalike);

      // New external address check: never appeared in outgoing txs
      const isNew = isNewExternalAddress(validation.address, knownOutgoingAddresses);
      setIsNewAddress(isNew);

      // Contract check
      setContractStatus('checking');
      checkIsContract(validation.address, publicClient, { isDemoMode }).then((res) => {
        setContractStatus(res.status);
      });
    },
    [t, profile?.wallet_address, knownUsedAddresses, knownOutgoingAddresses, isDemoMode]
  );

  // Handle Recipient Input & Routing between external 0x address vs @username
  const handleRecipientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (isLikelyAddressInput(val)) {
      handleExternalAddressInput(val);
    } else {
      const usernameVal = val.slice(0, 20);
      setRecipientInput(usernameVal);
      performLookup(usernameVal, 400);
    }
  };

  // Prefill resolver when opened with recipientId from friends tab
  useEffect(() => {
    if (prefilledRecipientId) {
      if (isLikelyAddressInput(prefilledRecipientId)) {
        handleExternalAddressInput(prefilledRecipientId);
      } else {
        performLookup(prefilledRecipientId, 0);
      }
    }
  }, [prefilledRecipientId, performLookup, handleExternalAddressInput]);

  const handleSelectFriendChip = (id: string) => {
    performLookup(id, 0);
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

    if (selectedAsset === 'ETH' && isEthBalanceTooLow) {
      return { valid: false, errorKey: 'insufficientEthFees' };
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
          formatted = '';
          break;
        }

        parsed -= 10000n;
        const nextFull = formatUnits(parsed, 6);
        const [nextIp, nextDp = ''] = nextFull.split('.');
        formatted = `${nextIp}.${nextDp.padEnd(2, '0').slice(0, 2)}`;
        parsed = parseAmountUnits(formatted, 'USDC');
      }

      if (parsed <= 0n) {
        return;
      }

      setAmountInput(formatted);
    } else {
      const initialTxCount = feeActive ? 2n : 1n;
      const initialGasReserve = computeGasReserve(ceilingWei, initialTxCount);
      if (balances.eth <= initialGasReserve) {
        return;
      }
      let maxUnits = computeMaxSendable(balances.eth, feeBps, initialGasReserve, isFeeExempt, 'ETH');
      if (maxUnits <= 0n) {
        return;
      }

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
          formatted = '';
          break;
        }

        parsed -= step;
        formatted = formatUnitsTrimmed(parsed, 18, 8);
        parsed = parseAmountUnits(formatted, 'ETH');
      }

      if (parsed <= 0n) {
        return;
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
      setSecurityError(
        resolvedRecipient.isExternal
          ? t.sheets.send.typeToConfirm.replace('{address}', shortenAddress(resolvedRecipient.address))
          : t.sheets.send.largeTransferPrompt.replace('{id}', resolvedRecipient.id)
      );
      setIsSubmitting(false);
      setProgressState(null);
      sendInProgressRef.current = false;
      return;
    }

    // 3b. External recipient checkboxes gating
    const hasRedExternalWarning = Boolean(
      lookalikeExternalAddress || contractStatus === 'contract' || contractStatus === 'error'
    );
    if (resolvedRecipient.isExternal) {
      if (contractStatus === 'checking') {
        setSecurityError(t.sheets.send.contractChecking);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
      if (!isExtAddressChecked) {
        setSecurityError(t.sheets.send.mustCheckAddress);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
      if (hasRedExternalWarning && !isExtRiskChecked) {
        setSecurityError(t.sheets.send.mustCheckRisk);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
    }

    // 4. Freeze snapshot LockedTransfer (execution only reads this snapshot)
    const currentSummary: LockedSummary = lockedSummary ?? {
      asset: selectedAsset,
      amountUnits,
      feeUnits,
      totalUnits: amountUnits + feeUnits,
      recipientId: resolvedRecipient.id,
      isExternal: resolvedRecipient.isExternal,
      recipientAddress: resolvedRecipient.address,
    };
    if (!lockedSummary) {
      setLockedSummary(currentSummary);
    }

    const snapshot: LockedTransfer = {
      asset: currentSummary.asset,
      amountUnits: currentSummary.amountUnits,
      feeUnits: currentSummary.feeUnits,
      recipientId: currentSummary.recipientId,
      recipientAddress: (currentSummary.recipientAddress || resolvedRecipient.address) as `0x${string}`,
      treasuryAddress: getTreasuryAddress(isDemoMode),
      senderAddress: profile.wallet_address as `0x${string}`,
      timestamp: Date.now(),
      isExternal: Boolean(currentSummary.isExternal ?? resolvedRecipient.isExternal),
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

    // 6. Re-resolve recipient if Pukico ID, OR validate directly if external address
    if (snapshot.isExternal) {
      const extValidation = validateExternalAddress(snapshot.recipientAddress, snapshot.senderAddress);
      if (!extValidation.valid) {
        setRecipientVerificationError(true);
        toast.error(t.toast.recipientUnverified);
        setStep(4);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
    } else {
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

        // Read address_changed during re-resolve and block send if not acknowledged
        if (latestResolve.address_changed) {
          setRecipientAddressChanged(true);
          if (latestResolve.previous_address) {
            setPreviousRecipientAddress(latestResolve.previous_address);
          }
          if (latestResolve.last_sent_at) {
            setLastSentAt(latestResolve.last_sent_at);
          }
          if (!isAddressChangeAcknowledged) {
            setSecurityError(t.sheets.send.addressChangeBlocked);
            toast.error(t.sheets.send.addressChangeBlocked);
            setStep(4);
            setIsSubmitting(false);
            setProgressState(null);
            sendInProgressRef.current = false;
            return;
          }
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
        ...(snapshot.isExternal
          ? {
              to_address: snapshot.recipientAddress,
              counterparty: null,
              counterparty_address: snapshot.recipientAddress,
              is_external: true,
            }
          : {
              to_pukico_id: snapshot.recipientId,
              counterparty: snapshot.recipientId,
            }),
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
      ...(snapshot.isExternal
        ? { to_address: snapshot.recipientAddress }
        : { to_pukico_id: snapshot.recipientId }),
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
          ...(snapshot.isExternal
            ? { to_address: snapshot.recipientAddress }
            : { to_pukico_id: snapshot.recipientId }),
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
          recipientId: snapshot.isExternal ? '' : snapshot.recipientId,
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
                ...(snapshot.isExternal
                  ? { to_address: snapshot.recipientAddress }
                  : { to_pukico_id: snapshot.recipientId }),
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
    <div ref={sheetContentRef} className="space-y-5 text-left select-none">
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
      {(isInsufficientEth || isEthBalanceTooLow) && !isWalletUnverified && balances !== null && (step === 3 || step === 4) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309]">
          <div className="flex items-start gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-[#B45309] shrink-0 mt-0.5" />
            <span className="leading-snug font-medium">
              {(() => {
                if (selectedAsset === 'ETH' && isEthBalanceTooLow) {
                  const template =
                    ethMinTxCount === 2n
                      ? t.sheets.send.insufficientEthFees
                      : (t.sheets.send.insufficientEthFeesSingle || t.sheets.send.insufficientEthFees);
                  return template
                    .replace('{needed}', fmt.ethBalance(ethGasNeeded))
                    .replace('{balance}', fmt.ethBalance(balances.eth));
                }
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
              {!isLikelyAddressInput(recipientInput) && (
                <span className="text-lg font-bold text-[#5B6577] mr-1.5" aria-hidden="true">
                  @
                </span>
              )}
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={66}
                value={recipientInput}
                onChange={handleRecipientChange}
                placeholder={isLikelyAddressInput(recipientInput) ? '0x...' : 'username'}
                className={`w-full h-full bg-transparent ${isLikelyAddressInput(recipientInput) ? 'font-mono text-sm' : 'text-base font-bold'} text-[#0A0B0D] placeholder:text-[#9CA3AF] placeholder:font-normal focus:outline-none`}
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
                resolvedRecipient.isExternal ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[#0052FF] font-medium">
                      <ExternalLink className="w-3.5 h-3.5 text-[#0052FF] shrink-0" />
                      <span>{t.sheets.send.externalWalletStatus}</span>
                      <span className="font-mono text-xs text-[#5B6577]">
                        ({shortenAddress(resolvedRecipient.address)})
                      </span>
                    </div>
                    {contractStatus === 'checking' && (
                      <div className="flex items-center gap-1.5 text-xs text-[#5B6577]">
                        <Loader2 className="w-3.5 h-3.5 text-[#0052FF] animate-spin shrink-0" />
                        <span>{t.sheets.send.contractChecking}</span>
                      </div>
                    )}
                    {externalChecksumWarning && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309] flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{t.sheets.send.noChecksumNote}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[#047857] font-medium">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#047857]" />
                    <span>
                      {t.sheets.send.found} · @{resolvedRecipient.id} ({shortenAddress(resolvedRecipient.address)})
                    </span>
                  </div>
                )
              )}
              {recipientStatus === 'not_found' && (
                <span className="text-[#DC2626]">
                  {t.sheets.send.noOneHasId.replace('{id}', recipientInput)}
                </span>
              )}
              {recipientStatus === 'lookup_error' && (
                <span className="text-[#B45309] font-medium">
                  {t.sheets.send.lookupError}
                </span>
              )}
              {recipientStatus === 'own_id' && (
                <span className="text-[#DC2626]">{t.sheets.send.ownIdError}</span>
              )}
              {recipientStatus === 'format_error' && (
                <span className="text-[#DC2626]">
                  {externalAddressError || t.sheets.send.formatError}
                </span>
              )}
            </div>

            {/* Terakhir dikirim (Recent recipients) */}
            {recentRecipients.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-semibold text-[#5B6577] mb-2">
                  {t.sheets.send.recentLabel}
                </div>
                <div className="flex flex-row gap-2">
                  {recentRecipients.map((item) => {
                    const initial = (item.id.charAt(0) || '?').toUpperCase();
                    const isSelected = recipientInput.toLowerCase().trim() === item.id.toLowerCase();
                    const isLooking = isSelected && recipientStatus === 'looking';
                    const isFound = isSelected && recipientStatus === 'found';
                    const isFailed =
                      (isSelected && recipientStatus === 'not_found') || failedLookupIds.has(item.id);

                    let relativeTime = '';
                    if (item.timestamp) {
                      relativeTime = formatRelativeTime(item.timestamp, lang);
                    }

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectFriendChip(item.id)}
                        aria-label={t.friends.sendTo.replace('{id}', item.id)}
                        className={`w-[calc((100%-16px)/3)] max-w-[calc((100%-16px)/3)] shrink-0 min-w-0 min-h-[44px] py-2.5 px-1.5 rounded-2xl flex flex-col items-center justify-center text-center transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] ${
                          isSelected
                            ? 'border-2 border-[#0052FF] bg-[#F5F8FF]'
                            : 'border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] hover:border-[#D1D5DB]'
                        }`}
                      >
                        <div className="relative mb-1.5">
                          <div className="w-9 h-9 rounded-full bg-[#EEF4FF] text-[#0052FF] font-bold text-xs flex items-center justify-center shrink-0">
                            {initial}
                          </div>
                          {isLooking && (
                            <div className="absolute inset-0 rounded-full bg-white/75 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 text-[#0052FF] animate-spin" />
                            </div>
                          )}
                          {isFound && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#0052FF] text-white flex items-center justify-center shadow-xs">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          )}
                          {isFailed && !isLooking && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#DC2626] text-white flex items-center justify-center text-[9px] font-bold shadow-xs">
                              !
                            </div>
                          )}
                        </div>

                        <div className="w-full font-mono text-xs font-bold text-[#0A0B0D] truncate">
                          @{item.id}
                        </div>

                        {relativeTime ? (
                          <div className="w-full text-[10px] text-[#5B6577] truncate mt-0.5">
                            {relativeTime}
                          </div>
                        ) : (
                          <div className="w-full text-[10px] text-transparent select-none mt-0.5" aria-hidden="true">
                            -
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Friends chips */}
            {availableFriends.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-semibold text-[#5B6577] mb-2">
                  {t.sheets.send.friendsLabel || 'Friends'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availableFriends.slice(0, 5).map((f) => (
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
              disabled={balances === null || (selectedAsset === 'ETH' && isEthBalanceTooLow)}
              onClick={handleMaxAmount}
              className="px-2 py-0.5 rounded-md bg-[#EEF4FF] hover:bg-[#BFDBFE] text-[#0052FF] font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                      : amountValidation.errorKey === 'insufficientEthFees'
                      ? (balances !== null
                          ? (ethMinTxCount === 2n
                              ? t.sheets.send.insufficientEthFees
                              : (t.sheets.send.insufficientEthFeesSingle || t.sheets.send.insufficientEthFees))
                              .replace('{needed}', fmt.ethBalance(ethGasNeeded))
                              .replace('{balance}', fmt.ethBalance(balances.eth))
                          : '')
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

            {/* Clear Fee Breakdown */}
            {amountUnits > 0n && amountValidation.valid && (
              <div className="p-3.5 rounded-2xl bg-white border border-[#E5E7EB] space-y-2.5 text-xs animate-fade-up">
                <div className="flex items-center justify-between font-semibold text-[#0A0B0D] pb-1.5 border-b border-[#F3F4F6]">
                  <span>{t.sheets.send.feeBreakdownTitle}</span>
                  <span className="text-[11px] font-normal text-[#5B6577]">
                    {selectedAsset === 'USDC' ? 'USDC · Base Sepolia' : 'ETH · Base Sepolia'}
                  </span>
                </div>

                {/* 1. Transfer amount */}
                <div className="flex items-center justify-between">
                  <span className="text-[#5B6577]">{t.sheets.send.transferAmountLabel}</span>
                  <span className="font-mono font-semibold text-[#0A0B0D]">
                    {selectedAsset === 'USDC'
                      ? `${fmt.usdcUnits(amountUnits)} USDC`
                      : `${fmt.units(amountUnits, ASSET_DECIMALS[selectedAsset])} ${selectedAsset}`}
                  </span>
                </div>

                {/* 2. Pukico service fee */}
                <div className="flex items-center justify-between">
                  <span className="text-[#5B6577] flex items-center gap-1.5">
                    <span>{t.sheets.send.serviceFee}</span>
                    {feeActive && feeUnits > 0n ? (
                      <span className="text-[10px] text-[#0052FF] font-semibold bg-[#EEF4FF] px-1.5 py-0.5 rounded">
                        {(feeBps / 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#047857] font-semibold bg-[#ECFDF5] px-1.5 py-0.5 rounded">
                        {t.sheets.send.serviceFeeFreeBadge}
                      </span>
                    )}
                  </span>
                  <span className="font-mono font-medium text-[#0A0B0D]">
                    {feeActive && feeUnits > 0n
                      ? `+${selectedAsset === 'USDC' ? fmt.usdcUnits(feeUnits) : fmt.units(feeUnits, ASSET_DECIMALS[selectedAsset])} ${selectedAsset}`
                      : `${selectedAsset === 'USDC' ? '0.00' : '0'} ${selectedAsset}`}
                  </span>
                </div>

                {/* 3. Total deduction from token balance */}
                <div className="flex items-center justify-between font-semibold pt-1 border-t border-[#F3F4F6]">
                  <span className="text-[#0A0B0D]">
                    {selectedAsset === 'USDC'
                      ? t.sheets.send.totalDeductionUsdc
                      : t.sheets.send.totalDeductionAsset.replace('{asset}', selectedAsset)}
                  </span>
                  <span className="font-mono font-bold text-[#0052FF]">
                    {selectedAsset === 'USDC'
                      ? `${fmt.usdcUnits(amountUnits + (feeActive ? feeUnits : 0n))} USDC`
                      : `${fmt.units(amountUnits + (feeActive ? feeUnits : 0n), ASSET_DECIMALS[selectedAsset])} ${selectedAsset}`}
                  </span>
                </div>

                {/* 4. Estimated Network Fee (Gas in ETH) */}
                <div className="flex items-center justify-between pt-1 border-t border-[#F3F4F6]">
                  <div className="flex items-center gap-1.5 text-[#5B6577]">
                    <span>{t.sheets.send.estimatedNetworkFee}</span>
                    <span className="text-[10px] text-[#5B6577] font-medium bg-[#F3F4F6] px-1.5 py-0.5 rounded">
                      {t.sheets.send.paidUsingEth}
                    </span>
                  </div>
                  <span className="font-mono text-[#0A0B0D]">
                    {isEstimatingFee ? (
                      <span className="inline-flex items-center gap-1 text-[#5B6577]">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{t.sheets.send.estimating}</span>
                      </span>
                    ) : estimatedFeeEth ? (
                      <span>{t.sheets.send.aboutFeeEth.replace('{fee}', fmt.number(estimatedFeeEth))}</span>
                    ) : (
                      <span className="text-[#9CA3AF]">{t.sheets.send.feeUnavailable}</span>
                    )}
                  </span>
                </div>

                {/* 5. Gas info & Footnotes */}
                <div className="space-y-1 pt-0.5 text-[11px] text-[#5B6577] leading-relaxed">
                  <p>
                    {t.sheets.send.gasPaidToNetwork}
                    {feeActive && feeUnits > 0n ? ` ${t.sheets.send.twoTxsNotice}` : ''}
                  </p>
                  {balances !== null && (
                    <div className="flex items-center justify-between pt-0.5 text-[#5B6577]">
                      <span>{t.sheets.send.availableEthBalance.replace('{amount}', fmt.ethBalance(balances.eth))}</span>
                      {isInsufficientEth && (
                        <span className="text-[#DC2626] font-semibold">{t.sheets.send.insufficientEthForGasWarning}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              disabled={!amountValidation.valid || isInsufficientEth || isEthBalanceTooLow || balances === null || !hasBetaAccess}
              onClick={() => {
                setSendFailedBeforeHash(false);
                setSecurityError(null);
                setLockedSummary({
                  asset: selectedAsset,
                  amountUnits,
                  feeUnits: feeActive ? feeUnits : 0n,
                  totalUnits: amountUnits + (feeActive ? feeUnits : 0n),
                  recipientId: resolvedRecipient?.id || '',
                });
                setStep(4);
                calculateFee(selectedAsset, resolvedRecipient?.address, amountInput);
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
        <div className="flex flex-col min-h-full">
          {/* (a) Scrollable Content Area */}
          <div className="space-y-3 pb-4 flex-1">
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

            {/* Internal Pukico ID: New Recipient Amber Warning */}
            {!isKnownRecipient && resolvedRecipient && !resolvedRecipient.isExternal && !lookalikeRecipientId && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">
                  {t.sheets.send.newRecipientWarning}
                </span>
              </div>
            )}

            {/* External Recipient: New Address Warning (ringkas satu baris, padding kecil, teks 12-13px) */}
            {resolvedRecipient?.isExternal && isNewAddress && !lookalikeExternalAddress && (
              <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309] flex items-center gap-2 animate-fade-up">
                <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
                <span className="font-medium leading-tight truncate">
                  {t.sheets.send.newExternalAddressWarning}
                </span>
              </div>
            )}

            {/* External Recipient: Address Poisoning Lookalike Red Banner with Side-by-Side Diff */}
            {resolvedRecipient?.isExternal && lookalikeExternalAddress && (() => {
              const diff = diffChunks(lookalikeExternalAddress, resolvedRecipient.address);
              return (
                <div
                  role="alert"
                  className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-[#991B1B] space-y-3 animate-fade-up"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-[#991B1B]">
                        {t.sheets.send.lookalikeAddressWarning}
                      </h4>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    {/* Previously used address */}
                    <div className="p-2.5 rounded-xl bg-white/90 border border-red-200/80 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#991B1B]">
                        {t.sheets.send.addressPoisoningSimilarLabel}
                      </span>
                      <div className="font-mono text-[11px] text-[#0A0B0D] break-all leading-relaxed select-all">
                        <span className="text-[#6B7280]">0x</span>
                        {diff.oldChunks.map((chunk, cIdx) => (
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

                    {/* Current target address */}
                    <div className="p-2.5 rounded-xl bg-white/90 border border-emerald-300 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#047857]">
                        {t.sheets.send.addressPoisoningCurrentLabel}
                      </span>
                      <div className="font-mono text-[11px] text-[#0A0B0D] break-all leading-relaxed select-all">
                        <span className="text-[#6B7280]">0x</span>
                        {diff.newChunks.map((chunk, cIdx) => (
                          <span key={cIdx} className="inline-block mr-1">
                            {chunk.chars.map((charObj, chIdx) => (
                              <span
                                key={chIdx}
                                className={
                                  charObj.isDiff
                                    ? 'bg-emerald-200 text-emerald-950 font-bold px-0.5 rounded'
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
                  </div>
                </div>
              );
            })()}

            {/* External Recipient: Contract Checking Notice */}
            {resolvedRecipient?.isExternal && contractStatus === 'checking' && (
              <div className="flex items-center gap-1.5 text-xs text-[#5B6577] animate-fade-up">
                <Loader2 className="w-3.5 h-3.5 text-[#0052FF] animate-spin shrink-0" />
                <span>{t.sheets.send.contractChecking}</span>
              </div>
            )}

            {/* External Recipient: Contract Warning Banner (Red) */}
            {resolvedRecipient?.isExternal && contractStatus === 'contract' && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-[#991B1B] flex items-start gap-2.5 animate-fade-up"
              >
                <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">
                  {t.sheets.send.contractWarning}
                </span>
              </div>
            )}

            {/* External Recipient: Contract Check Error Banner (Amber) */}
            {resolvedRecipient?.isExternal && contractStatus === 'error' && (
              <div
                role="alert"
                className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-[#B45309] flex items-start gap-2.5 animate-fade-up"
              >
                <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0 mt-0.5" />
                <span className="leading-relaxed font-medium">
                  {t.sheets.send.contractCheckFailed}
                </span>
              </div>
            )}

            {/* External Recipient: Compact Red Notice Banner (Menggabungkan pesan testnet & tidak bisa dibatalkan) */}
            {resolvedRecipient?.isExternal && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#991B1B] flex items-start gap-2 animate-fade-up"
              >
                <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                <span className="leading-snug font-medium">
                  {t.sheets.send.externalWalletNoticeBanner}
                </span>
              </div>
            )}

            {/* Compact Fee & Deduction Card */}
            {(() => {
              const reviewAsset = lockedSummary?.asset ?? selectedAsset;
              const reviewAmountUnits = lockedSummary?.amountUnits ?? amountUnits;
              const reviewFeeUnits = lockedSummary?.feeUnits ?? (feeActive ? feeUnits : 0n);
              const reviewTotalUnits = lockedSummary?.totalUnits ?? (amountUnits + (feeActive ? feeUnits : 0n));

              return (
                <div className="p-3 rounded-2xl bg-white border border-[#E5E7EB] text-xs divide-y divide-[#F3F4F6] space-y-2">
                  {/* Baris 1: Jumlah transfer */}
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-[#5B6577]">{t.sheets.send.transferAmountLabel}</span>
                    <span className="font-bold font-mono text-[#0A0B0D]">
                      {reviewAsset === 'USDC'
                        ? `${fmt.usdcUnits(reviewAmountUnits)} USDC`
                        : `${fmt.units(reviewAmountUnits, ASSET_DECIMALS[reviewAsset])} ${reviewAsset}`}
                    </span>
                  </div>

                  {/* Baris 2: Biaya layanan Pukico */}
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[#5B6577] flex items-center gap-1.5">
                      <span>{t.sheets.send.serviceFee}</span>
                      {reviewFeeUnits > 0n ? (
                        <span className="text-[10px] text-[#0052FF] font-semibold bg-[#EEF4FF] px-1.5 py-0.5 rounded">
                          {(feeBps / 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#047857] font-semibold bg-[#ECFDF5] px-1.5 py-0.5 rounded">
                          {t.sheets.send.serviceFeeFreeBadge}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[#0A0B0D] font-medium">
                      {reviewFeeUnits > 0n
                        ? `+${reviewAsset === 'USDC' ? fmt.usdcUnits(reviewFeeUnits) : fmt.units(reviewFeeUnits, ASSET_DECIMALS[reviewAsset])} ${reviewAsset}`
                        : `${reviewAsset === 'USDC' ? '0.00' : '0'} ${reviewAsset}`}
                    </span>
                  </div>

                  {/* Baris 3: Total potongan (tebal, biru) */}
                  <div className="flex items-center justify-between py-1.5 font-semibold">
                    <span className="text-[#0A0B0D]">
                      {reviewAsset === 'USDC'
                        ? t.sheets.send.totalDeductionUsdc
                        : t.sheets.send.totalDeductionAsset.replace('{asset}', reviewAsset)}
                    </span>
                    <span className="font-bold font-mono text-[#0052FF] text-sm">
                      {reviewAsset === 'USDC'
                        ? `${fmt.usdcUnits(reviewTotalUnits)} USDC`
                        : `${fmt.units(reviewTotalUnits, ASSET_DECIMALS[reviewAsset])} ${reviewAsset}`}
                    </span>
                  </div>

                  {/* Baris 4: Gas ≈ <estimasi> ETH · saldo ETH <saldo> & teks bantu satu baris */}
                  <div className="pt-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#5B6577] flex items-center gap-1">
                        <span>Gas ≈</span>
                        {isEstimatingFee ? (
                          <span className="inline-flex items-center gap-1 text-[#5B6577]">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            <span>{t.sheets.send.estimating}</span>
                          </span>
                        ) : estimatedFeeEth ? (
                          <span className="font-mono font-medium text-[#0A0B0D]">{fmt.number(estimatedFeeEth)} ETH</span>
                        ) : (
                          <span className="text-[#9CA3AF]">{t.sheets.send.feeUnavailable}</span>
                        )}
                      </span>
                      {balances !== null && (
                        <span className={`text-[11px] font-mono ${isInsufficientEth ? 'text-[#DC2626] font-semibold' : 'text-[#5B6577]'}`}>
                          saldo ETH {fmt.ethBalance(balances.eth)}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#9CA3AF] leading-tight truncate">
                      {t.sheets.send.gasHelperCompact}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Kartu Alamat Penerima (Alamat penuh checksum, badge Wallet luar, link Basescan) */}
            {resolvedRecipient && (
              <RecipientVerification
                recipientId={resolvedRecipient.isExternal ? undefined : resolvedRecipient.id}
                rawAddress={resolvedRecipient.address}
                addressChanged={recipientAddressChanged}
                previousAddress={previousRecipientAddress}
                lastSentAt={lastSentAt}
                isAddressChangeAcknowledged={isAddressChangeAcknowledged}
                onAcknowledgeChange={setIsAddressChangeAcknowledged}
                lookalikeId={resolvedRecipient.isExternal ? null : lookalikeRecipientId}
                isExternal={resolvedRecipient.isExternal}
                hideCheckbox={true}
                onCopyAddress={() => {
                  toast.success(t.toast.copiedAddress);
                }}
              />
            )}
          </div>

          {/* (b) Sticky Footer: Checkbox gating + Tombol Konfirmasi dan Kirim */}
          <div className="sticky bottom-0 -mx-5 -mb-[calc(20px+env(safe-area-inset-bottom,0px))] px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] bg-white border-t border-[#E5E7EB] z-20 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] max-h-[45dvh] flex flex-col justify-end mt-auto">
            <div className="overflow-y-auto space-y-2 max-h-[calc(45dvh-64px)] pr-0.5">
              {/* Input konfirmasi ketik untuk transfer besar */}
              {isLargeTransfer && resolvedRecipient && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[#B45309] font-bold">
                    <AlertTriangle className="w-3.5 h-3.5 text-[#B45309] shrink-0" />
                    <span>{t.sheets.send.largeTransferTitle}</span>
                  </div>
                  <p className="text-[#B45309] text-[11px] leading-tight">
                    {resolvedRecipient.isExternal
                      ? t.sheets.send.typeToConfirm.replace('{address}', shortenAddress(resolvedRecipient.address))
                      : t.sheets.send.largeTransferPrompt.replace('{id}', resolvedRecipient.id)}
                  </p>
                  <input
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={largeTransferInput}
                    onChange={(e) => setLargeTransferInput(e.target.value)}
                    placeholder={
                      resolvedRecipient.isExternal
                        ? shortenAddress(resolvedRecipient.address)
                        : t.sheets.send.largeTransferInputPlaceholder
                    }
                    className="w-full h-8 px-2.5 bg-white border border-amber-300 rounded-lg font-mono text-xs text-[#0A0B0D] placeholder:text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* Checkboxes gating transfer eksternal */}
              {resolvedRecipient?.isExternal && (
                <div className="p-2.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] space-y-1.5">
                  {/* Checkbox A: Selalu wajib untuk eksternal */}
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-[#0A0B0D] min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={isExtAddressChecked}
                      onChange={(e) => setIsExtAddressChecked(e.target.checked)}
                      className="w-4 h-4 rounded border-[#D1D5DB] text-[#0052FF] focus:ring-[#0052FF] cursor-pointer shrink-0"
                    />
                    <span className="leading-tight font-medium select-none">
                      {t.sheets.send.checkboxVerifyAddress}
                    </span>
                  </label>

                  {/* Checkbox B: Wajib jika poisoning, kontrak, atau error */}
                  {Boolean(lookalikeExternalAddress || contractStatus === 'contract' || contractStatus === 'error') && (
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs text-[#991B1B] min-h-[44px] pt-1.5 border-t border-[#E5E7EB]">
                      <input
                        type="checkbox"
                        checked={isExtRiskChecked}
                        onChange={(e) => setIsExtRiskChecked(e.target.checked)}
                        className="w-4 h-4 rounded border-red-300 text-[#DC2626] focus:ring-[#DC2626] cursor-pointer shrink-0"
                      />
                      <span className="leading-tight font-medium select-none">
                        {t.sheets.send.checkboxUnderstandRisk}
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* Checkbox pengakuan alamat berubah untuk penerima @username */}
              {!resolvedRecipient?.isExternal && recipientAddressChanged && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-[#991B1B] min-h-[44px]">
                    <input
                      type="checkbox"
                      checked={isAddressChangeAcknowledged}
                      onChange={(e) => setIsAddressChangeAcknowledged(e.target.checked)}
                      className="w-4 h-4 rounded border-red-300 text-[#DC2626] focus:ring-[#DC2626] cursor-pointer shrink-0"
                    />
                    <span className="leading-tight font-semibold select-none">
                      {t.sheets.send.addressChangeAcknowledge}
                    </span>
                  </label>
                </div>
              )}

              {/* Inline Security Gate Error */}
              {securityError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#B91C1C] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" />
                    <span className="font-medium leading-snug">{securityError}</span>
                  </div>
                </div>
              )}

              {/* Error recipient verification */}
              {recipientVerificationError && (
                <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-[#3B4455] flex items-center justify-between gap-2">
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

              {/* Error sendFailedBeforeHash */}
              {sendFailedBeforeHash && !recipientVerificationError && (
                <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-[#3B4455] flex items-center justify-between gap-2">
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
            </div>

            {/* Tombol Kirim */}
            <div className="pt-2">
              <button
                type="button"
                disabled={
                  isSubmitting ||
                  !hasBetaAccess ||
                  !amountValidation.valid ||
                  isInsufficientEth ||
                  balances === null ||
                  (isLargeTransfer && !isLargeConfirmed) ||
                  Boolean(resolvedRecipient?.isExternal && contractStatus === 'checking') ||
                  (!resolvedRecipient?.isExternal && recipientAddressChanged && !isAddressChangeAcknowledged) ||
                  Boolean(
                    resolvedRecipient?.isExternal &&
                      (!isExtAddressChecked ||
                        ((lookalikeExternalAddress ||
                          contractStatus === 'contract' ||
                          contractStatus === 'error') &&
                          !isExtRiskChecked))
                  )
                }
                onClick={handleExecuteSend}
                className="w-full h-12 rounded-2xl bg-[#0052FF] text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer shadow-sm"
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
                {lockedSummary.asset} →{' '}
                {lockedSummary.isExternal
                  ? shortenAddress(lockedSummary.recipientAddress || '')
                  : `@${lockedSummary.recipientId}`}
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
                    {lockedSummary?.isExternal
                      ? t.sheets.send.sentSuccessExternal
                          .replace('{amount}', displayAmount)
                          .replace('{asset}', displayAsset)
                          .replace(
                            '{address}',
                            shortenAddress(lockedSummary.recipientAddress || displayRecipient)
                          )
                      : t.sheets.send.sentSuccess
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
