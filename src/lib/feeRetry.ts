import { parseUnits } from 'viem';
import { getTreasuryAddress, getFeeBps, computeServiceFee, removePendingFee, computeGasReserve } from './fees';
import {
  buildTransferRequest,
  extractHash,
  isTxHash,
  fetchExactBalances,
  getGasPriceCeiling,
  type AssetType,
} from './txGuards';
import { publicClient } from './viemClient';
import { submitTxWithRetry, type TxRecord } from './txApi';

export interface RetryFeePaymentParams {
  tx: TxRecord;
  walletAddress: string;
  isDemoMode: boolean;
  sendTransaction?: (
    tx: any,
    options?: { uiOptions?: { showWalletUIs?: boolean }; [key: string]: any }
  ) => Promise<any>;
  getAccessToken?: () => Promise<string | null>;
}

export interface RetryFeePaymentResult {
  ok: boolean;
  feeTxHash?: string;
  error?: string;
}

function isUserRejected(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const errorObj = err as Record<string, any>;
  const cause = errorObj.cause as Record<string, any> | undefined;
  const code = errorObj.code ?? cause?.code;
  if (code === 4001 || code === 5000 || String(code) === '4001' || String(code) === '5000') {
    return true;
  }
  const name = errorObj.name || cause?.name;
  if (
    name === 'UserRejectedRequestError' ||
    name === 'TransactionRejectedRpcError' ||
    cause?.name === 'UserRejectedRequestError' ||
    cause?.name === 'TransactionRejectedRpcError'
  ) {
    return true;
  }
  const privyErrorCode = errorObj.privyErrorCode || cause?.privyErrorCode;
  if (
    privyErrorCode === 'exited_auth_flow' ||
    privyErrorCode === 'exited_link_flow' ||
    privyErrorCode === 'user_rejected' ||
    privyErrorCode === 'oauth_user_denied'
  ) {
    return true;
  }
  return false;
}

/**
 * Execute on-chain retry of service fee payment for an existing transaction.
 * Resubmits the transaction with new fee_tx_hash to backend edge function.
 */
export async function retryFeePayment({
  tx,
  walletAddress,
  isDemoMode,
  sendTransaction,
  getAccessToken,
}: RetryFeePaymentParams): Promise<RetryFeePaymentResult> {
  // Demo Mode Simulation
  if (isDemoMode) {
    await new Promise((r) => setTimeout(r, 650));
    const mockFeeTxHash =
      '0xfee' +
      Math.random().toString(16).slice(2).padEnd(32, '0') +
      Math.random().toString(16).slice(2).padEnd(32, '0');

    removePendingFee(walletAddress, tx.tx_hash);
    return { ok: true, feeTxHash: mockFeeTxHash };
  }

  // Live Mode Checks
  if (!sendTransaction) {
    return { ok: false, error: 'Wallet provider not available.' };
  }

  const treasuryAddress = getTreasuryAddress(false);
  if (!treasuryAddress) {
    return { ok: false, error: 'Treasury address is not configured.' };
  }

  // Calculate fee units from service_fee string or compute from tx amount
  let feeUnits: bigint = 0n;
  try {
    if (tx.service_fee && parseFloat(tx.service_fee) > 0) {
      feeUnits =
        tx.asset === 'USDC'
          ? parseUnits(tx.service_fee, 6)
          : parseUnits(tx.service_fee, 18);
    } else {
      const bps = getFeeBps(false);
      const amountUnits =
        tx.asset === 'USDC'
          ? parseUnits(tx.amount || '0', 6)
          : parseUnits(tx.amount || '0', 18);
      feeUnits = computeServiceFee(amountUnits, bps, false, tx.asset);
    }
  } catch {
    return { ok: false, error: 'Failed to calculate fee amount.' };
  }

  if (feeUnits <= 0n) {
    return { ok: false, error: 'Calculated fee amount is zero.' };
  }

  // Pre-check on-chain fresh balance before attempting fee broadcast
  try {
    const freshBals = await fetchExactBalances(walletAddress);
    const gasPrice = await getGasPriceCeiling(publicClient as any).catch(() => 2000000000n);
    const gasLimit = tx.asset === 'ETH' ? 21000n : 65000n;
    const gasWei = computeGasReserve(gasLimit * gasPrice, 1n);

    if (tx.asset === 'ETH') {
      if (freshBals.eth < feeUnits + gasWei) {
        return { ok: false, error: 'insufficient_eth' };
      }
    } else {
      if (freshBals.eth < gasWei || freshBals.usdc < feeUnits) {
        return { ok: false, error: 'insufficient_eth' };
      }
    }
  } catch {
    // If balance check fails, allow attempt to proceed
  }

  const feeTxRequest = buildTransferRequest(
    tx.asset as AssetType,
    treasuryAddress,
    feeUnits
  );

  // Send fee transaction with retry: max 3 attempts, delays: 0ms, 1500ms, 3000ms
  const retryDelays = [0, 1500, 3000];
  let feeTxHash: string | undefined = undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) {
      await new Promise((r) => setTimeout(r, retryDelays[attempt - 1]));
    }

    try {
      const feeResult = await sendTransaction(feeTxRequest, {
        address: walletAddress,
        uiOptions: { showWalletUIs: false },
      });

      const extracted = extractHash(feeResult);
      if (extracted && isTxHash(extracted)) {
        feeTxHash = extracted;
        break;
      }
    } catch (err: unknown) {
      if (isUserRejected(err)) {
        return { ok: false, error: 'user_rejected' };
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      const isInsufficientFunds =
        /insufficient funds/i.test(errMsg) ||
        /exceeds.*balance/i.test(errMsg) ||
        (err as any)?.name === 'InsufficientFundsError' ||
        (err as any)?.cause?.name === 'InsufficientFundsError';

      if (isInsufficientFunds) {
        return { ok: false, error: 'insufficient_eth' };
      }

      console.warn(`[feeRetry] Attempt ${attempt} failed:`, err);
    }
  }

  if (!feeTxHash) {
    return { ok: false, error: 'Fee transaction failed after retries.' };
  }

  // Resubmit transaction with new fee_tx_hash to backend
  try {
    const token = getAccessToken ? await getAccessToken().catch(() => null) : null;
    const recipientId = tx.to_pukico_id || tx.counterparty || '';

    await submitTxWithRetry(
      {
        tx_hash: tx.tx_hash,
        asset: tx.asset,
        to_pukico_id: recipientId,
        amount: tx.amount,
        fee_tx_hash: feeTxHash,
      },
      { privyToken: token }
    );

    removePendingFee(walletAddress, tx.tx_hash);
    return { ok: true, feeTxHash };
  } catch (resubmitErr) {
    console.error('[feeRetry] Resubmit with fee_tx_hash failed:', resubmitErr);
    // On-chain fee succeeded even if resubmit timed out
    removePendingFee(walletAddress, tx.tx_hash);
    return { ok: true, feeTxHash };
  }
}
