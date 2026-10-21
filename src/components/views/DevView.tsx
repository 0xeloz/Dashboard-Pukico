import React, { useState, useEffect } from 'react';
import { Terminal, Shield, RefreshCw, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { checkRpcStatus } from '../../lib/viemClient';
import { CHAIN_CONFIG, APP_METADATA } from '../../lib/config';
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
      <div className="w-full max-w-[560px] mx-auto py-12 px-4 text-center">
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
    <div className="w-full max-w-[560px] mx-auto px-4 sm:px-6 py-2 space-y-5 animate-fade-up">
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
              <span className="px-2 py-0.5 rounded-full bg-[#EEF4FF] text-[#0052FF] text-[11px] font-bold uppercase tracking-wider">
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

      {/* Diagnostics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="p-4 bg-white rounded-[20px] border border-[#E5E7EB] shadow-2xs">
          <div className="text-xs font-medium text-[#5B6577] mb-1">Privy DID</div>
          <div className="font-mono text-xs text-[#0A0B0D] break-all select-all font-semibold">
            {profile.privy_did}
          </div>
        </div>

        <div className="p-4 bg-white rounded-[20px] border border-[#E5E7EB] shadow-2xs">
          <div className="text-xs font-medium text-[#5B6577] mb-1">Wallet Address</div>
          <div className="font-mono text-xs text-[#0A0B0D] break-all select-all font-semibold">
            {profile.wallet_address}
          </div>
        </div>

        <div className="p-4 bg-white rounded-[20px] border border-[#E5E7EB] shadow-2xs">
          <div className="text-xs font-medium text-[#5B6577] mb-1">Chain ID & Target</div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-base font-bold text-[#0A0B0D] tabular-nums">
              {CHAIN_CONFIG.id}
            </span>
            <span className="text-xs text-[#5B6577]">({CHAIN_CONFIG.name})</span>
          </div>
        </div>

        <div className="p-4 bg-white rounded-[20px] border border-[#E5E7EB] shadow-2xs">
          <div className="text-xs font-medium text-[#5B6577] mb-1">Application Version</div>
          <div className="font-mono text-base font-bold text-[#0A0B0D]">
            {APP_METADATA.version}
          </div>
        </div>
      </div>

      {/* RPC Status Banner */}
      <div className="bg-white rounded-[20px] border border-[#E5E7EB] p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-[#0A0B0D]">Base Sepolia Public RPC Status</div>
          {rpcInfo.status === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#047857] text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : rpcInfo.status === 'checking' ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFFBEB] text-[#B45309] text-xs font-medium">
              Pinging...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FEF2F2] text-[#B91C1C] text-xs font-medium">
              RPC Error
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB]">
            <span className="text-[#5B6577] block mb-0.5">RPC Endpoint</span>
            <span className="font-mono text-[#0A0B0D] font-medium truncate block">
              {CHAIN_CONFIG.rpcUrl}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB]">
            <span className="text-[#5B6577] block mb-0.5">Latest Block</span>
            <span className="font-mono text-[#0A0B0D] font-medium tabular-nums block">
              {rpcInfo.blockNumber ? rpcInfo.blockNumber.toString() : '—'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] col-span-2 sm:col-span-1">
            <span className="text-[#5B6577] block mb-0.5">Roundtrip Latency</span>
            <span className="font-mono text-[#0A0B0D] font-medium tabular-nums block">
              {rpcInfo.latencyMs !== null ? `${rpcInfo.latencyMs} ms` : '—'}
            </span>
          </div>
        </div>

        {rpcInfo.error && (
          <div className="mt-3 p-3 rounded-xl bg-[#FEF2F2] text-[#B91C1C] text-xs font-mono">
            {rpcInfo.error}
          </div>
        )}
      </div>

      {/* JSON Profile */}
      <div className="bg-white rounded-[20px] border border-[#E5E7EB] p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
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
