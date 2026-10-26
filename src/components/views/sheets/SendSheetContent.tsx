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
import { parseUnits, formatUnits } from 'viem';
import { useAuth } from '../../../context/AuthContext';
import { useBalance } from '../../../context/BalanceContext';
import { useTx } from '../../../context/TxContext';
import { useFriends } from '../../../context/FriendsContext';
import { useToast } from '../../../context/ToastContext';
import { useT } from '../../../i18n';
import { publicClient, BASE_SEPOLIA_USDC_ADDRESS } from '../../../lib/viemClient';
import { ENV, CHAIN_CONFIG } from '../../../lib/config';
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
  maxSendableWithFee,
  getTreasuryAddress,
  getFeeBps,
  isFeeActive,
  isTreasuryAddress,
  formatUnitsTrimmed,
} from '../../../lib/fees';
import { UsdcTokenIcon, EthTokenIcon } from '../../ui/PukicoBrand';

interface SendSheetContentProps {
  onClose: () => void;
  isDemoMode?: boolean;
  onApprovalStateChange?: (isWaiting: boolean) => void;
  prefilledRecipientId?: string | null;
}

type SendStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type PreHashFailureReason = 'user_rejected' | 'insufficient_funds' | 'generic';

function identifyPreHashFailureReason(err: unknown): PreHashFailureReason {
  if (!err || typeof err !== 'object') {
    return 'generic';
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

  if (code === -32000 || code === -32003 || name === 'RpcError' || cause?.name === 'RpcError') {
    const rpcMessage = String(errorObj.shortMessage || errorObj.details || errorObj.message || '');
    const causeMessage = String(cause?.shortMessage || cause?.details || cause?.message || '');
    if (
      /insufficient funds/i.test(rpcMessage) ||
      /insufficient funds/i.test(causeMessage) ||
      /exceeds.*balance/i.test(rpcMessage) ||
      /exceeds.*balance/i.test(causeMessage)
    ) {
      return 'insufficient_funds';
    }
  }

  return 'generic';
}

const FAUCET_URL = 'https://portal.cdp.coinbase.com/products/faucet';

export function SendSheetContent({
  onClose,
  isDemoMode = false,
  onApprovalStateChange,
  prefilledRecipientId,
}: SendSheetContentProps) {
  const { t, formatNumber } = useT();
  const {
    profile,
    getAccessToken,
    sendTransaction,
    revokeBetaAccess,
    enrollMfa,
    hasPasskeyMfa,
    embeddedWalletAddress,
  } = useAuth();
  const { usdc, eth, refresh: refreshBalanceCtx } = useBalance();
  const { txs } = useTx();
  const { friends } = useFriends();
  const { toast } = useToast();

  const hasBetaAccess = profile?.beta_access === true || profile?.role === 'admin';

  // 1. Passkey requirement for live mode
  const needsPasskey = !isDemoMode && ENV.REQUIRE_PASSKEY && !hasPasskeyMfa;

  // Track passkey activation transition
  const prevPasskeyRef = useRef(hasPasskeyMfa);
  useEffect(() => {
    if (!prevPasskeyRef.current && hasPasskeyMfa) {
      toast.success(t.toast.passkeyActivated);
    }
    prevPasskeyRef.current = hasPasskeyMfa;
  }, [hasPasskeyMfa, t.toast.passkeyActivated, toast]);

  const [step, setStep] = useState<SendStep>(1);
  const [selectedAsset, setSelectedAsset] = useState<AssetType>('USDC');

  // Exact on-chain bigint balances with 15-second refresh
  const [exactBalances, setExactBalances] = useState<{ eth: bigint; usdc: bigint }>({
    eth: 0n,
    usdc: 0n,
  });

  const loadBalances = useCallback(async () => {
    if (!profile?.wallet_address) return;
    try {
      const res = await fetchExactBalances(profile.wallet_address);
      setExactBalances(res);
    } catch {
      // Safe fallback from BalanceContext
      try {
        const cleanUsdc = (usdc.value || '0').replace(/,/g, '').replace('<', '').trim();
        const cleanEth = (eth.value || '0').replace(/,/g, '').replace('<', '').trim();
        setExactBalances({
          usdc: parseUnits(cleanUsdc && !isNaN(Number(cleanUsdc)) ? cleanUsdc : '0', 6),
          eth: parseUnits(cleanEth && !isNaN(Number(cleanEth)) ? cleanEth : '0', 18),
        });
      } catch {
        // Keep prior state
      }
    }
  }, [profile?.wallet_address, usdc.value, eth.value]);

  useEffect(() => {
    loadBalances();
    const interval = setInterval(loadBalances, 15000);
    return () => clearInterval(interval);
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
  const [estimatedFeeEth, setEstimatedFeeEth] = useState<string | null>(null);
  const [estimatedFeeWei, setEstimatedFeeWei] = useState<bigint | null>(null);
  const [isEstimatingFee, setIsEstimatingFee] = useState<boolean>(false);
  const feeEstimateDebounceRef = useRef<number | null>(null);

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

  // Check ETH balance for gas fee availability
  const isEthZero = exactBalances.eth === 0n;
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
  const feeUnits = computeServiceFee(amountUnits, feeBps, isFeeExempt);

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

  // Fee Estimation with gas consideration for both transactions if fee is active
  const calculateFee = useCallback(
    async (asset: AssetType, targetAddr: string, valStr: string) => {
      setIsEstimatingFee(true);
      try {
        const maxFeePerGas = await getGasPriceCeiling(publicClient as any);
        let gasLimit = asset === 'ETH' ? 21000n : 65000n;

        // If service fee will be sent in a second transaction, account for second transfer gas
        const willSendFeeTx = isFeeActive(isDemoMode) && !isFeeExempt && feeUnits > 0n;
        const feeTxGas = asset === 'ETH' ? 21000n : 65000n;

        const totalGasLimit = gasLimit + (willSendFeeTx ? feeTxGas : 0n);
        const totalWei = totalGasLimit * maxFeePerGas;

        setEstimatedFeeWei(totalWei);
        setEstimatedFeeEth(formatEthFee(totalWei));
      } catch {
        const fallbackGas = asset === 'ETH' ? 21000n : 65000n;
        const fallbackWei = fallbackGas * 2000000000n;
        setEstimatedFeeWei(fallbackWei);
        setEstimatedFeeEth(null);
      } finally {
        setIsEstimatingFee(false);
      }
    },
    [isDemoMode, isFeeExempt, feeUnits]
  );

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

  // Validation using bigint directly (no float math)
  const validateAmount = (): { valid: boolean; errorKey?: string } => {
    if (!amountInput || amountInput.trim() === '') {
      return { valid: false, errorKey: 'enterAmountPlaceholder' };
    }

    if (amountUnits <= 0n) {
      return { valid: false, errorKey: 'enterAmountPlaceholder' };
    }

    if (selectedAsset === 'USDC') {
      const totalNeeded = amountUnits + feeUnits;
      if (totalNeeded > exactBalances.usdc) {
        return { valid: false, errorKey: 'notEnoughAsset' };
      }
      if (isEthZero) {
        return { valid: false, errorKey: 'needEthForFees' };
      }
    } else {
      // ETH: amount + fee + gas
      const reserveFee = estimatedFeeWei && estimatedFeeWei > 0n ? estimatedFeeWei : 21000n * 2000000000n;
      const totalNeeded = amountUnits + feeUnits + reserveFee;
      if (totalNeeded > exactBalances.eth) {
        return { valid: false, errorKey: 'notEnoughAsset' };
      }
    }

    return { valid: true };
  };

  const amountValidation = validateAmount();

  // Max Button handler leaving room for service fee and ETH gas
  const handleMaxAmount = () => {
    if (selectedAsset === 'USDC') {
      const maxUnits = maxSendableWithFee(exactBalances.usdc, feeBps, 0n, isFeeExempt);
      setAmountInput(formatUnitsTrimmed(maxUnits, 6));
    } else {
      const reserveFee = estimatedFeeWei && estimatedFeeWei > 0n ? estimatedFeeWei : 21000n * 2000000000n;
      const totalGasReserve = isFeeActive(isDemoMode) && !isFeeExempt ? reserveFee * 2n : reserveFee;
      const maxUnits = maxSendableWithFee(exactBalances.eth, feeBps, totalGasReserve, isFeeExempt);
      setAmountInput(formatUnitsTrimmed(maxUnits, 18, 8));
    }
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
      toast.error(t.sheets.send.securityPasskeyRequired);
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
    const snapshot: LockedTransfer = {
      asset: selectedAsset,
      amountUnits,
      feeUnits,
      recipientId: resolvedRecipient.id,
      recipientAddress: resolvedRecipient.address as `0x${string}`,
      treasuryAddress: getTreasuryAddress(isDemoMode),
      senderAddress: profile.wallet_address as `0x${string}`,
      timestamp: Date.now(),
    };

    // 5. Ensure embeddedWalletAddress matches profile.wallet_address
    if (embeddedWalletAddress && !sameAddress(embeddedWalletAddress, snapshot.senderAddress)) {
      setSecurityError(t.sheets.send.securityBlockedWalletMismatch);
      toast.error(t.sheets.send.securityBlockedWalletMismatch);
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
      toast.error(t.sheets.send.securityBlockedUnsafeAddress);
      setStep(4);
      setIsSubmitting(false);
      setProgressState(null);
      sendInProgressRef.current = false;
      return;
    }

    // 8. Read latest on-chain balance and verify balance >= amount + fee
    let freshBals: { eth: bigint; usdc: bigint };
    try {
      freshBals = await fetchExactBalances(snapshot.senderAddress);
      setExactBalances(freshBals);
    } catch {
      freshBals = exactBalances;
    }

    if (snapshot.asset === 'USDC') {
      if (snapshot.amountUnits + snapshot.feeUnits > freshBals.usdc) {
        setSecurityError(t.sheets.send.notEnoughAsset.replace('{asset}', 'USDC'));
        toast.error(t.toast.insufficientFunds);
        setStep(4);
        setIsSubmitting(false);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
    } else {
      if (snapshot.amountUnits + snapshot.feeUnits > freshBals.eth) {
        setSecurityError(t.sheets.send.notEnoughAsset.replace('{asset}', 'ETH'));
        toast.error(t.toast.insufficientFunds);
        setStep(4);
        setProgressState(null);
        sendInProgressRef.current = false;
        return;
      }
    }

    // 9. Simulate transfer and check ETH gas reserve
    const mainTxRequest = buildTransferRequest(
      snapshot.asset,
      snapshot.recipientAddress,
      snapshot.amountUnits
    );

    if (!isDemoMode) {
      try {
        const estimatedGas = await simulateTransfer(
          publicClient as any,
          snapshot.senderAddress,
          mainTxRequest
        );
        const gasCeiling = await getGasPriceCeiling(publicClient as any);
        const totalGasWei = estimatedGas * gasCeiling;
        const requiredEth =
          snapshot.asset === 'ETH' ? snapshot.amountUnits + snapshot.feeUnits + totalGasWei : totalGasWei;

        if (freshBals.eth < requiredEth) {
          setSecurityError(t.sheets.send.insufficientFundsOrGas);
          toast.error(t.toast.insufficientFunds);
          setStep(4);
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
      setStep(6);
      setProgressState('waiting_confirmation');

      // If fee active, demonstrate fee step briefly
      if (snapshot.feeUnits > 0n && snapshot.treasuryAddress) {
        setFeeApprovalPending(true);
        await new Promise((r) => setTimeout(r, 600));
        toast.info(t.toast.feePaid, { silent: true });
        setFeeApprovalPending(false);
      }

      const canonicalAmount = formatUnits(
        snapshot.amountUnits,
        ASSET_DECIMALS[snapshot.asset]
      );

      setStep(7);
      setFinalStatus('confirmed');
      toast.success(t.toast.transferConfirmed);
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
        toast.info(t.toast.sendCancelled);
      } else if (reason === 'insufficient_funds') {
        toast.error(t.toast.insufficientFunds);
      }
      return;
    }

    // 11. Valid hash exists - execute second fee transaction and backend tracking
    setTxHash(broadcastHash);
    toast.info(t.toast.transferSent, { silent: true });
    setProgressState('waiting_confirmation');
    setStep(6);

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

    // Execute fee transfer as secondary transfer (does not fail main transfer)
    if (snapshot.feeUnits > 0n && snapshot.treasuryAddress) {
      setFeeApprovalPending(true);
      try {
        const feeTxRequest = buildTransferRequest(
          snapshot.asset,
          snapshot.treasuryAddress,
          snapshot.feeUnits
        );
        await sendTransaction(feeTxRequest, {
          address: profile.wallet_address,
          uiOptions: { showWalletUIs: false },
        });
        toast.info(t.toast.feePaid, { silent: true });
      } catch (_feeErr) {
        toast.warning(t.toast.feeFailed);
      } finally {
        setFeeApprovalPending(false);
      }
    }

    try {
      const token = getAccessToken ? await getAccessToken() : null;

      // Submit to backend
      let submitRes;
      try {
        submitRes = await submitTxWithRetry(
          {
            tx_hash: broadcastHash,
            asset: snapshot.asset,
            to_pukico_id: snapshot.recipientId,
            amount: canonicalAmount,
          },
          { privyToken: token }
        );
      } catch {
        // Continue to polling
      }

      if (submitRes && !submitRes.ok && submitRes.error === 'no_access') {
        revokeBetaAccess();
        toast.error(t.toast.betaAccessRevoked);
        setIsSubmitting(false);
        setProgressState(null);
        setFinalStatus('no_access');
        setStep(7);
        sendInProgressRef.current = false;
        return;
      }

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
            toast.success(t.toast.transferConfirmed);
            setStep(7);
            confirmed = true;
            refreshBalanceCtx();
            loadBalances();
            break;
          }
          if (syncRes.tx.status === 'failed') {
            setFinalTxRecord(syncRes.tx);
            setFinalStatus('failed');
            toast.error(t.toast.transferFailed);
            setStep(7);
            confirmed = true;
            refreshBalanceCtx();
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

      {/* Prerequisite 2: Zero ETH for Gas Fee Notice */}
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
                onClick={() => enrollMfa()}
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
                disabled={isWalletUnverified || !hasBetaAccess}
                onClick={() => {
                  if (!hasBetaAccess) return;
                  setSelectedAsset('USDC');
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
                  <div className="font-mono text-sm font-bold text-[#0A0B0D]">
                    {formatNumber(formatUnits(exactBalances.usdc, 6), { minDecimals: 2, maxDecimals: 2 })} USDC
                  </div>
                  <div className="text-[11px] text-[#5B6577]">{t.common.testnet}</div>
                </div>
              </button>

              {/* ETH Row */}
              <button
                type="button"
                disabled={isWalletUnverified || !hasBetaAccess}
                onClick={() => {
                  if (!hasBetaAccess) return;
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
                  <div className="font-mono text-sm font-bold text-[#0A0B0D]">
                    {formatNumber(formatUnits(exactBalances.eth, 18), { minDecimals: 2, maxDecimals: 4 })} ETH
                  </div>
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
                    ? formatUnitsTrimmed(exactBalances.usdc, 6)
                    : formatUnitsTrimmed(exactBalances.eth, 18, 4)
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
              disabled={!amountValidation.valid || !hasBetaAccess}
              onClick={() => {
                setSendFailedBeforeHash(false);
                setSecurityError(null);
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
            {feeUnits > 0n ? (
              <>
                <div className="py-2 flex items-center justify-between">
                  <span className="text-[#5B6577]">{t.sheets.send.recipientGets}</span>
                  <span className="font-bold font-mono text-[#0A0B0D]">
                    {formatUnitsTrimmed(amountUnits, ASSET_DECIMALS[selectedAsset])} {selectedAsset}
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
                    +{formatUnitsTrimmed(feeUnits, ASSET_DECIMALS[selectedAsset])} {selectedAsset}
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between font-semibold">
                  <span className="text-[#0A0B0D]">{t.sheets.send.totalFromYou}</span>
                  <span className="font-bold font-mono text-[#0052FF]">
                    {formatUnitsTrimmed(amountUnits + feeUnits, ASSET_DECIMALS[selectedAsset])} {selectedAsset}
                  </span>
                </div>
              </>
            ) : (
              <div className="py-2.5 flex items-center justify-between">
                <span className="text-[#5B6577]">{t.sheets.send.amountLabel}</span>
                <span className="font-bold font-mono text-[#0A0B0D]">
                  {formatAssetAmount(amountInput, selectedAsset)} {selectedAsset}
                </span>
              </div>
            )}

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
              disabled={isSubmitting || !hasBetaAccess || (isLargeTransfer && !isLargeConfirmed)}
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
