import React, { useState, useEffect } from 'react';
import { AlertCircle, ExternalLink, Loader2, KeyRound } from 'lucide-react';
import { useT } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { initClaim, redeemAccessCode, type RedeemAccessCodeReason } from '../../lib/claimApi';

interface AccessCodeViewProps {
  gate?: 'closed' | 'full' | 'revoked' | string | null;
}

export function AccessCodeView({ gate: propGate }: AccessCodeViewProps = {}) {
  const { t } = useT();
  const { isDemoMode, getAccessToken, grantBetaAccess, logout } = useAuth();

  const [code, setCode] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Waitlist init state
  const [isLoadingInit, setIsLoadingInit] = useState<boolean>(true);
  const [onWaitlist, setOnWaitlist] = useState<boolean>(false);
  const [heldId, setHeldId] = useState<string | null>(null);
  const [gate, setGate] = useState<'closed' | 'full' | 'revoked' | string | null>(propGate ?? null);

  useEffect(() => {
    let isCancelled = false;

    async function checkWaitlistInit() {
      try {
        const token = getAccessToken ? await getAccessToken() : null;
        const res = await initClaim({
          privyToken: token,
          isDemoMode,
        });

        if (isCancelled) return;

        // If user already has full access, proceed directly to onboarding
        if (res.has_access) {
          grantBetaAccess();
          return;
        }

        setOnWaitlist(Boolean(res.on_waitlist));
        setHeldId(res.held_id ?? null);
        if ((res as any)?.gate !== undefined) {
          setGate((res as any).gate);
        }
      } catch (_err) {
        // If init fails, treat as on_waitlist = false and do not display error
        if (!isCancelled) {
          setOnWaitlist(false);
          setHeldId(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingInit(false);
        }
      }
    }

    checkWaitlistInit();

    return () => {
      isCancelled = true;
    };
  }, [getAccessToken, isDemoMode, grantBetaAccess]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setCode(val);
    setErrorMessage(null);
  };

  const mapRedeemError = (reason: RedeemAccessCodeReason): string => {
    switch (reason) {
      case 'invalid_code':
        return t.accessCode.errors.invalid_code;
      case 'expired':
        return t.accessCode.errors.expired;
      case 'used':
        return t.accessCode.errors.used;
      case 'rate_limited':
        return t.accessCode.errors.rate_limited;
      case 'no_access':
      case 'server':
      case 'network':
      default:
        return t.accessCode.errors.server;
    }
  };

  const handleSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken ? await getAccessToken() : null;
      const res = await redeemAccessCode(trimmed, {
        privyToken: token,
        isDemoMode,
      });

      if (res.ok) {
        grantBetaAccess();
      } else {
        setErrorMessage(mapRedeemError(res.reason));
      }
    } catch (_err) {
      setErrorMessage(t.accessCode.errors.server);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && code.trim() && !isSubmitting) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-[#F7F8FA] flex flex-col justify-between px-5 py-7 max-w-lg mx-auto w-full select-none"
      role="main"
      aria-label="Closed Beta Access Code"
    >
      {/* Header bar: Logo + Demo badge */}
      <header className="flex items-center justify-between pt-1 pb-4">
        <div className="flex items-center gap-2">
          <img
            src="/pukico-logo.png"
            alt="Pukico"
            className="w-8 h-8 rounded-lg object-contain"
          />
          <span className="font-bold text-base tracking-tight text-[#0A0B0D]">
            Pukico
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isDemoMode && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#E5E7EB] text-[#5B6577]">
              {t.onboarding.demoDataNotice}
            </span>
          )}
        </div>
      </header>

      {/* Main container */}
      <div className="flex-1 flex flex-col justify-center py-4">
        <section className="space-y-6" aria-labelledby="access-code-title">
          <div>
            <h1
              id="access-code-title"
              className="text-2xl sm:text-3xl font-extrabold text-[#0A0B0D] tracking-tight"
            >
              {gate === 'full' ? t.accessCode.fullTitle : t.accessCode.title}
            </h1>
            <p className="text-sm sm:text-base text-[#5B6577] mt-2 leading-relaxed">
              {gate === 'full' ? t.accessCode.fullSubtitle : t.accessCode.subtitle}
            </p>
          </div>

          {/* Waitlist status notification above input */}
          {isLoadingInit ? (
            <div className="h-14 rounded-2xl bg-[#E5E7EB]/50 animate-pulse" aria-hidden="true" />
          ) : onWaitlist ? (
            <div className="p-4 rounded-2xl bg-[#EEF4FF] border border-[#BFDBFE] text-left space-y-1">
              <p className="text-xs sm:text-sm font-semibold text-[#0052FF] leading-relaxed">
                {t.accessCode.onWaitlistNotice}
              </p>
              {heldId && (
                <p className="text-xs text-[#3B4455] font-medium leading-relaxed">
                  {t.accessCode.heldIdNotice.replace('{id}', heldId)}
                </p>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-[#F0F2F5] border border-[#E5E7EB] text-left">
              <p className="text-xs sm:text-sm text-[#5B6577] font-medium leading-relaxed">
                {gate === 'full'
                  ? t.accessCode.fullNotOnWaitlistNotice
                  : t.accessCode.notOnWaitlistNotice}
              </p>
            </div>
          )}

          {/* Access Code Input */}
          <div className="space-y-2">
            <div className="relative flex items-center h-14 bg-white border border-[#E5E7EB] focus-within:border-[#0052FF] focus-within:ring-2 focus-within:ring-[#0052FF]/20 rounded-2xl px-4 transition-all">
              <KeyRound
                className="w-5 h-5 text-[#5B6577] mr-2.5 shrink-0"
                aria-hidden="true"
              />
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                value={code}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={t.accessCode.placeholder}
                disabled={isSubmitting}
                className="w-full h-full bg-transparent text-lg font-mono font-bold uppercase tracking-wider text-[#0A0B0D] placeholder:text-[#9CA3AF] placeholder:font-normal placeholder:tracking-normal focus:outline-none"
                autoFocus
              />
            </div>

            {/* Error message banner */}
            {errorMessage && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#DC2626] flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Small helper text */}
            <p className="text-xs text-[#5B6577] pt-1 leading-relaxed">
              {t.accessCode.emailHint}
            </p>
          </div>

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!code.trim() || isSubmitting}
              className="w-full h-13 rounded-2xl bg-[#0052FF] text-white font-semibold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
              <span>{t.accessCode.submitBtn}</span>
            </button>
          </div>

          {/* Waitlist link and Logout */}
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            {!isLoadingInit && !onWaitlist && (
              <a
                href="https://pukico.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#0052FF] hover:underline cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>{t.accessCode.waitlistLink}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="text-xs font-medium text-[#5B6577] hover:text-[#0A0B0D] cursor-pointer transition-colors pt-1"
            >
              {isLoggingOut ? t.common.loading : t.accessCode.logoutBtn}
            </button>
          </div>
        </section>
      </div>

      {/* Footer text */}
      <footer className="text-center text-xs text-[#9CA3AF] py-2 border-t border-[#E5E7EB]/60">
        Pukico © 2026 · Base Sepolia Testnet
      </footer>
    </main>
  );
}
