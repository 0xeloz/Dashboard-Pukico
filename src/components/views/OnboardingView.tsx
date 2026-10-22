import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Check,
  AlertCircle,
  Clock,
  Ban,
  ShieldCheck,
  Globe,
  Wallet,
  Loader2,
} from 'lucide-react';
import { useT } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import {
  initClaim,
  checkPukicoIdAvailability,
  claimPukicoId,
  validatePukicoIdFormat,
  type CheckStatus,
  type ClaimError,
} from '../../lib/claimApi';

interface OnboardingViewProps {
  onComplete: (newId: string) => void;
}

type OnboardingStep = 1 | 2 | 3;

export function OnboardingView({ onComplete }: OnboardingViewProps) {
  const { t } = useT();
  const { isDemoMode, getAccessToken } = useAuth();

  const [step, setStep] = useState<OnboardingStep>(1);
  const [rawInput, setRawInput] = useState<string>('');
  const [status, setStatus] = useState<CheckStatus | 'idle' | 'checking'>('idle');
  const [heldId, setHeldId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [agreed, setAgreed] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [claimErrorMessage, setClaimErrorMessage] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string>('');

  const checkDebounceTimerRef = useRef<number | null>(null);
  const latestCheckRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize: Check if user has an ID held from waitlist
  useEffect(() => {
    let isCancelled = false;

    async function checkWaitlistInit() {
      try {
        const token = getAccessToken ? await getAccessToken() : null;
        const res = await initClaim({ privyToken: token, isDemoMode });
        if (!isCancelled) {
          if (res.held_id) {
            setHeldId(res.held_id);
            setRawInput(res.held_id);
            setStatus('yours');
          }
        }
      } catch (_err) {
        // Silently continue to normal onboarding
      } finally {
        if (!isCancelled) {
          setIsInitializing(false);
        }
      }
    }

    checkWaitlistInit();

    return () => {
      isCancelled = true;
    };
  }, [getAccessToken, isDemoMode]);

  // Handle typing with validation and 400ms debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip leading @ if pasted, convert to lowercase, allow only a-z0-9_
    const rawVal = e.target.value.replace(/^@+/, '').toLowerCase();
    const sanitized = rawVal.replace(/[^a-z0-9_]/g, '').slice(0, 20);

    setRawInput(sanitized);
    setClaimErrorMessage(null);

    // Cancel pending checks
    if (checkDebounceTimerRef.current) {
      window.clearTimeout(checkDebounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (sanitized.length === 0) {
      setStatus('idle');
      return;
    }

    if (sanitized.length < 3) {
      setStatus('format');
      return;
    }

    // If matches held ID from waitlist
    if (heldId && sanitized === heldId.toLowerCase()) {
      setStatus('yours');
      return;
    }

    setStatus('checking');

    const requestId = ++latestCheckRequestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    checkDebounceTimerRef.current = window.setTimeout(async () => {
      try {
        const token = getAccessToken ? await getAccessToken() : null;
        const result = await checkPukicoIdAvailability(
          sanitized,
          { privyToken: token, isDemoMode },
          controller.signal
        );

        if (requestId === latestCheckRequestIdRef.current) {
          setStatus(result);
        }
      } catch (err: unknown) {
        if (requestId === latestCheckRequestIdRef.current) {
          if ((err as Error)?.name !== 'AbortError') {
            setStatus('format');
          }
        }
      }
    }, 400);
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (checkDebounceTimerRef.current) {
        window.clearTimeout(checkDebounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const canContinueStep1 =
    (status === 'available' || status === 'yours') &&
    validatePukicoIdFormat(rawInput);

  const handleContinueToStep2 = () => {
    if (!canContinueStep1) return;
    setConfirmedId(rawInput.toLowerCase().trim());
    setAgreed(false);
    setClaimErrorMessage(null);
    setStep(2);
  };

  const mapClaimError = useCallback(
    (code: ClaimError, id: string): string => {
      switch (code) {
        case 'taken':
          return t.onboarding.errorClaimTaken.replace('{id}', id);
        case 'held':
          return t.onboarding.errorClaimHeld.replace('{id}', id);
        case 'already_claimed':
          return t.onboarding.errorAlreadyClaimed;
        case 'email_unverified':
          return t.onboarding.errorEmailUnverified;
        case 'unauthorized':
          return t.onboarding.errorUnauthorized;
        case 'network':
          return t.onboarding.errorNetwork;
        case 'server':
        case 'bad_request':
        case 'no_profile':
        case 'format':
        default:
          return t.onboarding.errorGeneric;
      }
    },
    [t]
  );

  const handleClaim = async () => {
    if (!agreed || isSubmitting || !confirmedId) return;

    setIsSubmitting(true);
    setClaimErrorMessage(null);

    try {
      const token = getAccessToken ? await getAccessToken() : null;
      const result = await claimPukicoId(confirmedId, {
        privyToken: token,
        isDemoMode,
      });

      if (result.ok) {
        setStep(3);
      } else {
        setClaimErrorMessage(mapClaimError(result.error, confirmedId));
        if (result.error === 'taken' || result.error === 'held') {
          // If taken concurrently, return to step 1
          setStatus(result.error);
        }
      }
    } catch (_err) {
      setClaimErrorMessage(t.onboarding.errorGeneric);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDashboard = () => {
    onComplete(confirmedId);
  };

  return (
    <main
      className="min-h-screen bg-[#F7F8FA] flex flex-col justify-between px-5 py-7 max-w-lg mx-auto w-full select-none"
      role="main"
      aria-label="Pukico ID Onboarding"
    >
      {/* Header bar: Logo + Step indicator / Demo badge */}
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
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E5E7EB] text-[#5B6577] uppercase tracking-wider">
              {t.onboarding.demoDataNotice}
            </span>
          )}

          {step < 3 && (
            <span
              className="text-xs font-semibold text-[#5B6577] px-2.5 py-1 bg-white border border-[#E5E7EB] rounded-full"
              aria-label={`Step ${step} of 2`}
            >
              {step === 1
                ? t.onboarding.stepIndicator1
                : t.onboarding.stepIndicator2}
            </span>
          )}
        </div>
      </header>

      {/* Main step container with 240ms fade-through animation */}
      <div className="flex-1 flex flex-col justify-center py-4">
        {step === 1 && (
          <section
            key="step1"
            className="animate-fade-through space-y-6"
            aria-labelledby="step1-title"
          >
            <div>
              <h1
                id="step1-title"
                className="text-2xl sm:text-3xl font-extrabold text-[#0A0B0D] tracking-tight"
              >
                {t.onboarding.step1Title}
              </h1>
              <p className="text-sm sm:text-base text-[#5B6577] mt-2 leading-relaxed">
                {t.onboarding.step1Sub}
              </p>
            </div>

            {/* Held for you badge if detected */}
            {heldId && (
              <div className="flex items-center gap-2 text-xs font-medium text-[#0052FF] bg-[#EEF4FF] border border-[#BFDBFE] px-3 py-2 rounded-xl">
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#0052FF]" />
                <span>{t.onboarding.heldForYouBadge}</span>
              </div>
            )}

            {/* Large 56px Input */}
            <div className="space-y-2">
              <div className="relative flex items-center h-14 bg-white border border-[#E5E7EB] focus-within:border-[#0052FF] focus-within:ring-2 focus-within:ring-[#0052FF]/20 rounded-2xl px-4 transition-all">
                <span
                  className="text-xl font-bold text-[#5B6577] select-none mr-1.5"
                  aria-hidden="true"
                >
                  @
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={20}
                  value={rawInput}
                  onChange={handleInputChange}
                  placeholder={t.onboarding.placeholder}
                  disabled={isInitializing}
                  aria-label={t.onboarding.step1Title}
                  aria-describedby="input-status-line input-hint"
                  className="w-full h-full bg-transparent text-xl font-bold text-[#0A0B0D] placeholder:text-[#9CA3AF] placeholder:font-normal focus:outline-none"
                  autoFocus
                />
                {status === 'checking' && (
                  <Loader2 className="w-5 h-5 text-[#0052FF] animate-spin shrink-0 ml-2" />
                )}
                {status === 'available' && (
                  <div className="w-6 h-6 rounded-full bg-emerald-50 text-[#047857] flex items-center justify-center shrink-0 ml-2">
                    <Check className="w-4 h-4" />
                  </div>
                )}
                {status === 'yours' && (
                  <div className="w-6 h-6 rounded-full bg-blue-50 text-[#0052FF] flex items-center justify-center shrink-0 ml-2">
                    <Check className="w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Status row with smooth height animation */}
              <div
                id="input-status-line"
                aria-live="polite"
                className="overflow-hidden transition-all duration-200"
                style={{
                  minHeight: '24px',
                }}
              >
                {status === 'checking' && (
                  <div className="flex items-center gap-1.5 text-xs text-[#5B6577] pt-0.5">
                    <Clock className="w-3.5 h-3.5 text-[#5B6577]" />
                    <span>{t.onboarding.statusChecking}</span>
                  </div>
                )}

                {status === 'available' && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#047857] pt-0.5">
                    <Check className="w-3.5 h-3.5 text-[#047857]" />
                    <span>
                      {t.onboarding.statusAvailable.replace('{id}', rawInput)}
                    </span>
                  </div>
                )}

                {status === 'yours' && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#0052FF] pt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#0052FF]" />
                    <span>
                      {t.onboarding.statusYours.replace('{id}', rawInput)}
                    </span>
                  </div>
                )}

                {status === 'taken' && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#DC2626] pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 text-[#DC2626]" />
                    <span>
                      {t.onboarding.statusTaken.replace('{id}', rawInput)}
                    </span>
                  </div>
                )}

                {status === 'held' && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#D97706] pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 text-[#D97706]" />
                    <span>
                      {t.onboarding.statusHeld.replace('{id}', rawInput)}
                    </span>
                  </div>
                )}

                {status === 'reserved' && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[#DC2626] pt-0.5">
                    <Ban className="w-3.5 h-3.5 text-[#DC2626]" />
                    <span>{t.onboarding.statusReserved}</span>
                  </div>
                )}

                {status === 'format' && (
                  <div className="flex items-center gap-1.5 text-xs text-[#DC2626] pt-0.5">
                    <AlertCircle className="w-3.5 h-3.5 text-[#DC2626]" />
                    <span>{t.onboarding.statusFormat}</span>
                  </div>
                )}

                {status === 'idle' && (
                  <p id="input-hint" className="text-xs text-[#5B6577] pt-0.5">
                    {t.onboarding.hint}
                  </p>
                )}
              </div>
            </div>

            {/* Flat Continue button */}
            <div className="pt-4">
              <button
                type="button"
                onClick={handleContinueToStep2}
                disabled={!canContinueStep1}
                className="w-full h-13 rounded-2xl bg-[#0052FF] text-white font-semibold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center cursor-pointer"
              >
                {t.onboarding.continueBtn}
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section
            key="step2"
            className="animate-fade-through space-y-6"
            aria-labelledby="step2-title"
          >
            <div>
              <h1
                id="step2-title"
                className="text-2xl sm:text-3xl font-extrabold text-[#0A0B0D] tracking-tight"
              >
                {t.onboarding.step2Title.replace('{id}', confirmedId)}
              </h1>
              {/* Large @id display */}
              <div className="mt-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0052FF]">
                  @{confirmedId}
                </span>
                <span className="text-xs font-medium text-[#5B6577] bg-white border border-[#E5E7EB] px-2.5 py-1 rounded-lg">
                  Base Sepolia
                </span>
              </div>
            </div>

            {/* Three bullet points with icons (flat, clean dividers) */}
            <div className="space-y-4 pt-1 pb-2">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center shrink-0 mt-0.5 text-[#0A0B0D]">
                  <ShieldCheck className="w-4 h-4 text-[#0052FF]" />
                </div>
                <div className="text-sm text-[#3B4455] leading-relaxed">
                  {t.onboarding.point1}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center shrink-0 mt-0.5 text-[#0A0B0D]">
                  <Globe className="w-4 h-4 text-[#0052FF]" />
                </div>
                <div className="text-sm text-[#3B4455] leading-relaxed">
                  {t.onboarding.point2}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center shrink-0 mt-0.5 text-[#0A0B0D]">
                  <Wallet className="w-4 h-4 text-[#0052FF]" />
                </div>
                <div className="text-sm text-[#3B4455] leading-relaxed">
                  {t.onboarding.point3}
                </div>
              </div>
            </div>

            {/* Checkbox agreement */}
            <label className="flex items-center gap-3 cursor-pointer py-2 group">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-5 h-5 rounded-md border-[#D1D5DB] text-[#0052FF] focus:ring-[#0052FF] cursor-pointer"
              />
              <span className="text-sm font-medium text-[#0A0B0D] group-hover:text-black">
                {t.onboarding.checkbox}
              </span>
            </label>

            {/* Error banner if claim failed */}
            {claimErrorMessage && (
              <div
                role="alert"
                className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-[#DC2626] flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-[#DC2626]" />
                <span>{claimErrorMessage}</span>
              </div>
            )}

            {/* Primary Claim button + Choose another text link */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleClaim}
                disabled={!agreed || isSubmitting}
                className="w-full h-13 rounded-2xl bg-[#0052FF] text-white font-semibold text-base transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                <span>
                  {t.onboarding.claimBtn.replace('{id}', confirmedId)}
                </span>
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setClaimErrorMessage(null);
                  }}
                  disabled={isSubmitting}
                  className="text-sm font-medium text-[#5B6577] hover:text-[#0A0B0D] underline underline-offset-4 cursor-pointer transition-colors"
                >
                  {t.onboarding.chooseAnother}
                </button>
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section
            key="step3"
            className="animate-fade-through space-y-6 text-center py-6"
            aria-labelledby="step3-title"
          >
            {/* Smoothly scaling green #047857 checkmark icon (220ms, 0.9 to 1) */}
            <div className="flex justify-center pt-2">
              <div className="w-20 h-20 rounded-full bg-emerald-50 text-[#047857] flex items-center justify-center animate-checkmark-pop">
                <Check className="w-10 h-10 stroke-[2.5]" />
              </div>
            </div>

            <div className="space-y-2 max-w-sm mx-auto">
              <h1
                id="step3-title"
                className="text-2xl sm:text-3xl font-extrabold text-[#0A0B0D] tracking-tight"
              >
                {t.onboarding.successTitle}
              </h1>
              <p className="text-sm sm:text-base text-[#5B6577] leading-relaxed">
                {t.onboarding.successSub.replace('{id}', confirmedId)}
              </p>
            </div>

            {/* Claimed ID pill */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#E5E7EB] rounded-2xl">
              <span className="w-2 h-2 rounded-full bg-[#047857]" />
              <span className="text-base font-bold text-[#0A0B0D]">
                @{confirmedId}
              </span>
            </div>

            {/* Open dashboard button */}
            <div className="pt-8 max-w-sm mx-auto w-full">
              <button
                type="button"
                onClick={handleOpenDashboard}
                className="w-full h-13 rounded-2xl bg-[#0052FF] text-white font-semibold text-base transition-all hover:bg-[#0042D6] active:scale-[0.99] flex items-center justify-center cursor-pointer"
              >
                {t.onboarding.openDashboardBtn}
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Footer text */}
      <footer className="text-center text-xs text-[#9CA3AF] py-2 border-t border-[#E5E7EB]/60">
        Pukico © 2026 · Base Sepolia Testnet
      </footer>
    </main>
  );
}
