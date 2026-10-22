import React, { useState, useEffect, useRef } from 'react';
import { useT } from '../../i18n';

interface SplashScreenProps {
  isLoading: boolean;
  onFinished?: () => void;
}

export function SplashScreen({ isLoading, onFinished }: SplashScreenProps) {
  const { t } = useT();

  const [mounted, setMounted] = useState<boolean>(true);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [showSlowText, setShowSlowText] = useState<boolean>(false);

  const mountTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<number | null>(null);
  const slowTimerRef = useRef<number | null>(null);

  // Show "Still loading..." if waiting longer than 3 seconds
  useEffect(() => {
    slowTimerRef.current = window.setTimeout(() => {
      setShowSlowText(true);
    }, 3000);

    return () => {
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
      }
    };
  }, []);

  // Guarantee minimum 400ms display, then 240ms fade-out
  useEffect(() => {
    if (!isLoading) {
      const elapsed = Date.now() - mountTimeRef.current;
      const minDelay = 400;
      const remaining = Math.max(0, minDelay - elapsed);

      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReduced) {
        timerRef.current = window.setTimeout(() => {
          setMounted(false);
          onFinished?.();
        }, remaining);
        return;
      }

      timerRef.current = window.setTimeout(() => {
        setIsFadingOut(true);
        timerRef.current = window.setTimeout(() => {
          setMounted(false);
          onFinished?.();
        }, 240);
      }, remaining);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isLoading, onFinished]);

  if (!mounted) return null;

  return (
    <div
      aria-live="polite"
      className={`fixed inset-0 z-[100] bg-[#F7F8FA] flex flex-col items-center justify-center transition-opacity duration-240 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        transitionTimingFunction: 'var(--ease-out)',
      }}
    >
      <div className="flex flex-col items-center justify-center">
        <img
          src="/pukico-logo.png"
          alt="Pukico"
          className="w-16 h-16 object-contain rounded-2xl animate-fade-up select-none pointer-events-none"
        />

        {showSlowText && (
          <p className="text-xs text-[#5B6577] mt-3 animate-fade-up font-medium">
            {t.splash.stillLoading}
          </p>
        )}
      </div>
    </div>
  );
}
