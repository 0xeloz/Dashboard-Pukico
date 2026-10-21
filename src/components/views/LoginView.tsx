import React, { useState } from 'react';
import { Mail, AlertCircle, RefreshCw, LogOut, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { APP_METADATA } from '../../lib/config';

export function LoginView() {
  const {
    login,
    logout,
    retrySession,
    isLoadingSession,
    sessionError,
  } = useAuth();

  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-between p-4 sm:p-6">
      <div className="w-full max-w-[560px] mx-auto my-auto py-8 text-center">
        {/* Logo */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-6 flex items-center justify-center">
          {!logoFailed ? (
            <img
              src="/pukico-logo.png"
              alt="Pukico Logo"
              onError={() => setLogoFailed(true)}
              className="w-full h-full object-contain rounded-2xl"
            />
          ) : (
            <div className="w-full h-full rounded-2xl bg-[#0052FF] flex items-center justify-center text-white font-bold text-2xl tracking-tight">
              P
            </div>
          )}
        </div>

        {/* Heading and subtitle */}
        <h1 className="text-2xl sm:text-3xl font-bold text-[#0A0B0D] mb-2">
          Sign in to Pukico
        </h1>
        <p className="text-xs sm:text-sm text-[#5B6577] leading-relaxed mb-6 font-medium">
          Invite-only beta · Base Sepolia testnet · No real money
        </p>

        {/* State 1: Session Loading */}
        {isLoadingSession && (
          <div className="p-5 bg-[#EEF4FF] rounded-2xl mb-6 text-center">
            <RefreshCw className="w-6 h-6 text-[#0052FF] animate-spin mx-auto mb-2" />
            <div className="font-semibold text-sm text-[#0A0B0D] mb-0.5">
              Authenticating Session
            </div>
            <p className="text-xs text-[#3B4455]">
              Connecting embedded wallet and verifying authorization...
            </p>
          </div>
        )}

        {/* State 2: Session Error (unauthorized, wallet_in_use, server) */}
        {sessionError && !isLoadingSession && (
          <div className="p-5 bg-[#FEF2F2] rounded-2xl border border-[#FECACA] mb-6 text-left">
            <div className="flex items-start gap-2.5 mb-2">
              <AlertCircle className="w-5 h-5 text-[#B91C1C] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-[#B91C1C] capitalize">
                  {sessionError.type === 'unauthorized'
                    ? 'Unauthorized Access'
                    : sessionError.type === 'wallet_in_use'
                    ? 'Wallet Already Linked'
                    : 'Session Server Error'}
                </h4>
                <p className="text-xs text-[#B91C1C]/90 mt-1 leading-relaxed">
                  {sessionError.message}
                </p>
              </div>
            </div>

            {/* Action buttons on error */}
            <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[#FECACA]">
              <button
                type="button"
                onClick={retrySession}
                className="py-2 px-3 rounded-xl bg-white hover:bg-[#FEE2E2] border border-[#FECACA] text-xs font-semibold text-[#B91C1C] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try again</span>
              </button>
              <button
                type="button"
                onClick={logout}
                className="py-2 px-3 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log out</span>
              </button>
            </div>
          </div>
        )}

        {/* State 3: Primary Action: Continue with email */}
        {!isLoadingSession && !sessionError && (
          <div className="space-y-3 max-w-sm mx-auto">
            <button
              type="button"
              onClick={login}
              className="w-full py-3.5 px-4 rounded-xl font-medium text-sm bg-[#0052FF] hover:bg-[#0042D6] text-white flex items-center justify-center gap-2.5 transition-all duration-150 cursor-pointer active:scale-[0.98]"
            >
              <Mail className="w-4 h-4" />
              <span>Continue with email</span>
            </button>
          </div>
        )}

        {/* Testnet Security Badge */}
        <div className="mt-8 pt-5 border-t border-[#E5E7EB] flex items-center justify-center gap-2 text-xs text-[#5B6577]">
          <ShieldCheck className="w-4 h-4 text-[#047857]" />
          <span>Base Sepolia testnet only · Zero real funds required</span>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-2 text-xs text-[#3B4455]">
        Pukico Dashboard &copy; 2026 · Phase 1: Authentication & Profile
      </footer>
    </div>
  );
}
