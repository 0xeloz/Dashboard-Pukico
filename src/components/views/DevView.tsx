import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Shield,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Coins,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { formatUnits } from 'viem';
import { checkRpcStatus } from '../../lib/viemClient';
import { CHAIN_CONFIG, APP_METADATA } from '../../lib/config';
import {
  CONFIGURED_TREASURY_ADDRESS,
  CONFIGURED_FEE_BPS,
  isFeeActive,
  getLastFeeLog,
  type FeeLogEntry,
} from '../../lib/fees';
import { fetchExactBalances, sameAddress } from '../../lib/txGuards';
import { formatEthBalance, formatUsdcUnits } from '../../lib/formatters';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useT } from '../../i18n';
import {
  fetchFeeReport,
  shortenAddress,
  getExplorerUrl,
  type FeeReportResponse,
} from '../../lib/txApi';
import type { UserProfile, RpcStatusInfo } from '../../types';


interface DevViewProps {
  profile: UserProfile;
  onRedirectToHome: () => void;
}

export function DevView({ profile, onRedirectToHome }: DevViewProps) {
  const [rpcInfo, setRpcInfo] = useState<RpcStatusInfo>({
    status: 'checking',
    blockNumber: null,
    latencyMs: null,
    chainId: CHAIN_CONFIG.id,
    networkName: CHAIN_CONFIG.name,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Strict role check: only admin allowed
  useEffect(() => {
    if (profile.role !== 'admin') {
      onRedirectToHome();
    }
  }, [profile.role, onRedirectToHome]);

  const loadRpcStatus = async () => {
    setIsRefreshing(true);
    try {
      const info = await checkRpcStatus();
      setRpcInfo(info);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadRpcStatus();
  }, []);

  if (profile.role !== 'admin') {
    return (
      <div className="w-full max-w-[560px] lg:max-w-[720px] mx-auto py-12 px-4 text-center">
        <AlertTriangle className="w-10 h-10 text-[#B91C1C] mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[#0A0B0D] mb-1">Access Restricted</h2>
        <p className="text-xs text-[#5B6577] mb-4">
          This console is reserved for administrator roles. Redirecting to home...
        </p>
      </div>
    );
  }

  // Safe sanitized profile object (strictly without tokens or secrets)
  const safeProfileJson = JSON.stringify(
    {
      privy_did: profile.privy_did,
      email_hint: profile.email_hint,
      wallet_address: profile.wallet_address,
      wallet_verified: profile.wallet_verified,
      pukico_id: profile.pukico_id,
      role: profile.role,
    },
    null,
    2
  );

  return (
    <div className="w-full max-w-[560px] lg:max-w-[720px] mx-auto px-4 sm:px-6 py-2 space-y-5 animate-fade-up">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRedirectToHome}
            className="w-10 h-10 rounded-2xl border border-[#E5E7EB] bg-white text-[#3B4455] hover:text-[#0A0B0D] hover:bg-[#EEF4FF] flex items-center justify-center transition-all cursor-pointer active:scale-[0.98]"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#0A0B0D]">/dev Console</h1>
              <span className="px-2 py-0.5 rounded-full bg-[#EEF4FF] text-[#0052FF] text-[13px] font-semibold">
                Admin
              </span>
            </div>
            <p className="text-xs text-[#5B6577]">Internal system & session diagnostics</p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadRpcStatus}
          disabled={isRefreshing}
          className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#EEF4FF] text-xs font-semibold text-[#0A0B0D] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#0052FF]' : ''}`} />
          <span>Ping</span>
        </button>
      </div>

      {/* Diagnostics (Datar langsung di latar #F7F8FA dengan garis pemisah border-b #E5E7EB) */}
      <div className="divide-y divide-[#E5E7EB] border-b border-[#E5E7EB]">
        <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-xs font-medium text-[#5B6577]">Privy DID</span>
          <span className="font-mono text-xs text-[#0A0B0D] break-all select-all font-semibold">
            {profile.privy_did}
          </span>
        </div>

        <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <span className="text-xs font-medium text-[#5B6577]">Wallet Address</span>
          <span className="font-mono text-xs text-[#0A0B0D] break-all select-all font-semibold">
            {profile.wallet_address}
          </span>
        </div>

        <div className="py-3 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[#5B6577]">Chain ID & Target</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-sm font-bold text-[#0A0B0D] tabular-nums">
              {CHAIN_CONFIG.id}
            </span>
            <span className="text-xs text-[#5B6577]">({CHAIN_CONFIG.name})</span>
          </div>
        </div>

        <div className="py-3 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[#5B6577]">Application Version</span>
          <span className="font-mono text-sm font-bold text-[#0A0B0D]">
            {APP_METADATA.version}
          </span>
        </div>
      </div>

      {/* RPC Status Section (Datar) */}
      <div className="py-4 border-b border-[#E5E7EB] space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-[#0A0B0D]">Base Sepolia Public RPC Status</div>
          {rpcInfo.status === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#047857] text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : rpcInfo.status === 'checking' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FFFBEB] text-[#B45309] text-xs font-medium">
              Pinging...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FEF2F2] text-[#B91C1C] text-xs font-medium">
              RPC Error
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs pt-1">
          <div className="py-1">
            <span className="text-[#5B6577] block text-[11px] mb-0.5">RPC Endpoint</span>
            <span className="font-mono text-[#0A0B0D] font-medium truncate block">
              {CHAIN_CONFIG.rpcUrl}
            </span>
          </div>
          <div className="py-1">
            <span className="text-[#5B6577] block text-[11px] mb-0.5">Latest Block</span>
            <span className="font-mono text-[#0A0B0D] font-medium tabular-nums block">
              {rpcInfo.blockNumber ? rpcInfo.blockNumber.toString() : '—'}
            </span>
          </div>
          <div className="py-1 col-span-2 sm:col-span-1">
            <span className="text-[#5B6577] block text-[11px] mb-0.5">Roundtrip Latency</span>
            <span className="font-mono text-[#0A0B0D] font-medium tabular-nums block">
              {rpcInfo.latencyMs !== null ? `${rpcInfo.latencyMs} ms` : '—'}
            </span>
          </div>
        </div>

        {rpcInfo.error && (
          <div className="text-[#B91C1C] text-xs font-mono pt-1">
            {rpcInfo.error}
          </div>
        )}
      </div>

      {/* Treasury (Revenue) Section */}
      <TreasuryCard adminWalletAddress={profile.wallet_address} />

      {/* Latest Fee Log (Diagnostics) */}
      <LatestFeeLogSection />

      {/* JSON Profile (Blok kode tetap diizinkan) */}
      <div className="py-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#0052FF]" />
            <h3 className="text-sm font-semibold text-[#0A0B0D]">Session Profile JSON</h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#047857]">
            <Shield className="w-3.5 h-3.5" />
            <span>Zero secrets exposed</span>
          </div>
        </div>
        <pre className="p-4 rounded-xl bg-[#0A0B0D] text-[#EEF4FF] font-mono text-xs overflow-x-auto leading-relaxed">
          {safeProfileJson}
        </pre>
      </div>
    </div>
  );
}

function TreasuryCard({ adminWalletAddress }: { adminWalletAddress: string }) {
  const { toast } = useToast();
  const { fmt } = useT();
  const { isDemoMode, getAccessToken } = useAuth();

  const [copied, setCopied] = useState(false);
  const [balances, setBalances] = useState<{ eth: bigint; usdc: bigint } | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<FeeReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const treasuryAddress = report?.treasury || CONFIGURED_TREASURY_ADDRESS;
  const bps = report?.fee_bps ?? (CONFIGURED_FEE_BPS || 50);
  const isServerActive = report ? report.active : isFeeActive(isDemoMode);
  const isSameAsAdmin = sameAddress(treasuryAddress, adminWalletAddress);

  const loadData = async () => {
    setReportLoading(true);
    setLoading(true);

    try {
      const token = getAccessToken ? await getAccessToken().catch(() => null) : null;
      const res = await fetchFeeReport(token, { isDemoMode });
      setReport(res);

      const targetAddress = res.treasury || treasuryAddress;
      if (targetAddress) {
        const balRes = await fetchExactBalances(targetAddress).catch(() => null);
        setBalances(balRes);
      }
    } catch (err) {
      console.warn('Failed to fetch fee report:', err);
    } finally {
      setReportLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [treasuryAddress, isDemoMode]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.info('Address copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  return (
    <div className="py-4 border-b border-[#E5E7EB] space-y-3">
      {/* Header with Title, Status badge & Refresh Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-[#0052FF]" />
          <h3 className="text-sm font-semibold text-[#0A0B0D]">Treasury (revenue)</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={reportLoading}
            className="p-1 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#EEF4FF] text-[#5B6577] hover:text-[#0A0B0D] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh fee report"
            aria-label="Refresh fee report"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reportLoading ? 'animate-spin text-[#0052FF]' : ''}`} />
          </button>

          {isServerActive ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#047857] text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Aktif · {(bps / 100).toFixed(1)}% ({bps} bps)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FEF2F2] text-[#B91C1C] text-xs font-semibold">
              Nonaktif
            </span>
          )}
        </div>
      </div>

      {/* Warning message if active=false on server */}
      {!isServerActive && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309] font-medium">
          Fee nonaktif di server: isi secret TREASURY_ADDRESS
        </div>
      )}

      {/* Treasury Address & Balances */}
      {treasuryAddress ? (
        <div className="space-y-3 pt-1 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-[#5B6577]">Treasury Address</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[#0A0B0D] font-semibold select-all break-all">
                {treasuryAddress}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(treasuryAddress)}
                className="text-[#5B6577] hover:text-[#0A0B0D] p-1 rounded cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#047857]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[#5B6577]">Admin Wallet Status</span>
            {isSameAsAdmin ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#047857] font-semibold text-[11px]">
                Matches current admin wallet
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-[#B45309] font-semibold text-[11px]">
                Different from admin wallet
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[#5B6577]">Treasury Balances</span>
            <span className="font-mono text-[#0A0B0D] font-semibold">
              {loading
                ? 'Loading...'
                : balances
                ? `${fmt.usdcUnits(balances.usdc)} USDC · ${fmt.ethBalance(balances.eth)} ETH`
                : '—'}
            </span>
          </div>

          <div>
            <a
              href={`https://sepolia.basescan.org/address/${treasuryAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[#0052FF] hover:underline font-semibold"
            >
              <span>View treasury on Basescan</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Revenue Report Statistics */}
          {report && (
            <div className="pt-2 border-t border-[#E5E7EB] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Total Fee Terbayar */}
                <div className="p-2.5 rounded-xl bg-white border border-[#E5E7EB] space-y-1">
                  <div className="text-[11px] font-semibold text-[#047857] uppercase tracking-wider">
                    Total Fee Terbayar
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[#5B6577]">USDC ({report.totals.USDC.paid_count} tx):</span>
                      <span className="font-mono font-bold text-[#0A0B0D]">
                        {fmt.usdcString(report.totals.USDC.paid_amount)} USDC
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#5B6577]">ETH ({report.totals.ETH.paid_count} tx):</span>
                      <span className="font-mono font-bold text-[#0A0B0D]">
                        {fmt.ethBalance(report.totals.ETH.paid_amount)} ETH
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total Fee Terutang */}
                <div className="p-2.5 rounded-xl bg-white border border-[#E5E7EB] space-y-1">
                  <div className="text-[11px] font-semibold text-[#B45309] uppercase tracking-wider">
                    Total Fee Terutang
                  </div>
                  <div className="text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[#5B6577]">USDC ({report.totals.USDC.due_count} tx):</span>
                      <span className="font-mono font-bold text-[#B45309]">
                        {fmt.usdcString(report.totals.USDC.due_amount)} USDC
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#5B6577]">ETH ({report.totals.ETH.due_count} tx):</span>
                      <span className="font-mono font-bold text-[#B45309]">
                        {fmt.ethBalance(report.totals.ETH.due_amount)} ETH
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Daftar Transaksi Belum Terbayar (Maks 20) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#0A0B0D]">
                    Transaksi Belum Terbayar ({report.unpaid.length})
                  </span>
                  {report.unpaid.length > 20 && (
                    <span className="text-[10px] text-[#5B6577]">Menampilkan 20 teratas</span>
                  )}
                </div>

                {report.unpaid.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-100 text-[11px] text-[#047857]">
                    Semua biaya layanan transaksi telah terverifikasi lunas.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                    {report.unpaid.slice(0, 20).map((item) => (
                      <div
                        key={item.tx_hash}
                        className="p-2 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <a
                            href={getExplorerUrl(item.tx_hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] text-[#0052FF] hover:underline flex items-center gap-0.5 shrink-0"
                            title="Buka transaksi di Basescan"
                          >
                            <span>{shortenAddress(item.tx_hash)}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                          <span className="text-[#5B6577] text-[11px] truncate">
                            @{item.from.replace(/^@/, '')}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-[#B45309] shrink-0 text-xs">
                          {item.asset === 'USDC' ? fmt.usdcString(item.expected) : fmt.ethBalance(item.expected)}{' '}
                          {item.asset}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-[#B45309] space-y-2">
          <p className="font-semibold">Treasury Address is not set in live mode.</p>
          <p className="leading-relaxed">
            Current admin wallet: <code className="font-mono font-bold text-[#0A0B0D]">{adminWalletAddress}</code>
          </p>
          <p className="text-[11px] leading-relaxed">
            To activate service fee revenue, set <code className="bg-amber-100/70 px-1 py-0.5 rounded">VITE_TREASURY_ADDRESS={adminWalletAddress}</code> and optionally <code className="bg-amber-100/70 px-1 py-0.5 rounded">VITE_FEE_BPS=50</code> in your environment variables.
          </p>
        </div>
      )}
    </div>
  );
}

function LatestFeeLogSection() {
  const [feeLog, setFeeLog] = useState<FeeLogEntry | null>(() => getLastFeeLog());

  const handleRefresh = () => {
    setFeeLog(getLastFeeLog());
  };

  return (
    <div className="py-4 border-b border-[#E5E7EB] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#0052FF]" />
          <h3 className="text-sm font-semibold text-[#0A0B0D]">Latest Fee Transaction Log</h3>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="text-xs text-[#0052FF] font-semibold hover:underline cursor-pointer"
        >
          Refresh
        </button>
      </div>

      {feeLog ? (
        <div className="p-3 bg-white border border-[#E5E7EB] rounded-xl text-xs space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[#5B6577]">Reason:</span>
            <span className={`font-bold ${feeLog.reason === 'success' ? 'text-[#047857]' : 'text-[#B45309]'}`}>
              {feeLog.reason}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#5B6577]">Tx Hash:</span>
            <span className="text-[#0A0B0D] select-all truncate max-w-[200px]">
              {feeLog.txHash}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#5B6577]">Attempt:</span>
            <span className="text-[#0A0B0D]">{feeLog.attempt}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#5B6577]">Time:</span>
            <span className="text-[#5B6577]">{new Date(feeLog.timestamp).toLocaleTimeString()}</span>
          </div>
          {feeLog.message && (
            <div className="pt-1 border-t border-[#E5E7EB] text-[#5B6577] text-[11px] break-words">
              {feeLog.message}
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-[#5B6577] italic py-1">
          No fee transactions logged yet in this session.
        </div>
      )}
    </div>
  );
}


