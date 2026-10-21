import React, { useState } from 'react';
import { Copy, Check, LogOut, Shield, Mail, Wallet, Network, UserCheck } from 'lucide-react';
import { CHAIN_CONFIG } from '../../lib/config';
import type { UserProfile } from '../../types';

interface SettingsViewProps {
  profile: UserProfile;
  isDemoMode: boolean;
  onLogout: () => Promise<void>;
  onToggleRole?: (role: 'user' | 'admin') => void;
  onTogglePukicoId?: (hasId: boolean) => void;
}

export function SettingsView({
  profile,
  isDemoMode,
  onLogout,
  onToggleRole,
  onTogglePukicoId,
}: SettingsViewProps) {
  const [copied, setCopied] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const maskEmail = (emailStr: string) => {
    if (!emailStr) return 'No email associated';
    const parts = emailStr.split('@');
    if (parts.length !== 2) return emailStr;
    const [user, domain] = parts;
    if (user.length <= 2) {
      return `${user[0]}***@${domain}`;
    }
    return `${user.slice(0, 3)}***@${domain}`;
  };

  const displayEmail = profile.email_hint || maskEmail(profile.privy_did);

  const handleCopyWallet = async () => {
    try {
      await navigator.clipboard.writeText(profile.wallet_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = profile.wallet_address;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogoutClick = async () => {
    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="w-full max-w-[560px] mx-auto px-4 sm:px-6 py-2 space-y-6 animate-fade-up">
      <div>
        <h1 className="text-xl font-bold text-[#0A0B0D]">Account Settings</h1>
        <p className="text-xs text-[#5B6577]">Profile and connection details</p>
      </div>

      <div className="divide-y divide-[#E5E7EB] border-b border-[#E5E7EB]">
        {/* Pukico ID Item (Read-only as required: no edit or delete option) */}
        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 text-[#0052FF]" />
            </div>
            <div>
              <div className="text-xs text-[#5B6577] font-medium">Pukico ID</div>
              <div className="font-semibold text-sm text-[#0A0B0D] font-mono">
                {profile.pukico_id ? `@${profile.pukico_id.replace(/^@/, '')}` : 'No Pukico ID yet'}
              </div>
            </div>
          </div>
          <span className="text-[11px] text-[#5B6577] italic sm:text-right">
            ID assignment is managed automatically
          </span>
        </div>

        {/* Email */}
        <div className="py-4 flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-[#0052FF]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-[#5B6577] font-medium">Email Address</div>
              <div className="font-medium text-sm text-[#0A0B0D] truncate">
                {displayEmail}
              </div>
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#047857] font-semibold shrink-0">
            Verified
          </span>
        </div>

        {/* Wallet Address */}
        <div className="py-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-[#0052FF]" />
              </div>
              <div>
                <div className="text-xs text-[#5B6577] font-medium">Embedded Wallet</div>
                <div className="text-xs text-[#5B6577]">Ethereum (Base Sepolia)</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyWallet}
              className="px-2.5 py-1.5 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#EEF4FF] text-xs font-semibold text-[#0A0B0D] flex items-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
            >
              {copied ? (
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
          <div className="font-mono text-xs text-[#0A0B0D] break-all select-all font-semibold pt-1">
            {profile.wallet_address}
          </div>
        </div>

        {/* Network */}
        <div className="py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] flex items-center justify-center shrink-0">
              <Network className="w-5 h-5 text-[#0052FF]" />
            </div>
            <div>
              <div className="text-xs text-[#5B6577] font-medium">Network</div>
              <div className="font-semibold text-sm text-[#0A0B0D]">{CHAIN_CONFIG.name}</div>
            </div>
          </div>
          <span className="text-xs text-[#5B6577] font-mono font-medium">Chain ID: {CHAIN_CONFIG.id}</span>
        </div>

        {/* Role */}
        <div className="py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-[#0052FF]" />
            </div>
            <div>
              <div className="text-xs text-[#5B6577] font-medium">Role</div>
              <div className="font-semibold text-sm capitalize text-[#0A0B0D]">{profile.role}</div>
            </div>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              profile.role === 'admin'
                ? 'bg-[#EEF4FF] text-[#0052FF]'
                : 'bg-[#E5E7EB] text-[#3B4455]'
            }`}
          >
            {profile.role === 'admin' ? 'Administrator' : 'Standard User'}
          </span>
        </div>
      </div>

      {/* Demo Mode Testing Toggles (Only in Demo Mode to test UI variants without database) */}
      {isDemoMode && onToggleRole && onTogglePukicoId && (
        <div className="py-4 border-b border-[#E5E7EB]">
          <div className="text-xs font-bold text-[#92400E] uppercase tracking-wider mb-1">
            Demo Mode Controls (Preview Only)
          </div>
          <p className="text-xs text-[#B45309] mb-3">
            Test how the dashboard responds to different role permissions and Pukico ID states:
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onToggleRole(profile.role === 'admin' ? 'user' : 'admin')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#FDE68A] bg-[#FFFBEB] text-[#92400E] hover:bg-[#FEF3C7] transition-colors cursor-pointer"
            >
              Toggle Role: Currently {profile.role}
            </button>
            <button
              type="button"
              onClick={() => onTogglePukicoId(!profile.pukico_id)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#FDE68A] bg-[#FFFBEB] text-[#92400E] hover:bg-[#FEF3C7] transition-colors cursor-pointer"
            >
              Toggle Pukico ID: Currently {profile.pukico_id ? 'Assigned' : 'Empty'}
            </button>
          </div>
        </div>
      )}

      {/* Logout Action (Datar langsung di latar, tanpa kartu putih) */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleLogoutClick}
          disabled={isLoggingOut}
          className="w-full py-3.5 px-4 rounded-xl font-medium text-sm text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
        </button>
      </div>
    </div>
  );
}
