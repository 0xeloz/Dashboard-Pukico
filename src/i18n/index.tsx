import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { en, type Translations } from './en';
import { id } from './id';

import {
  formatUsdcUnits,
  formatUsdcString,
  formatAssetAmount,
  formatEthBalance,
  formatEthFee,
  localizeNumber,
} from '../lib/formatters';
import { formatUnitsTrimmed } from '../lib/fees';

export type Lang = 'en' | 'id';
export type LangPhase = 'idle' | 'out' | 'in';

export interface LangFormatters {
  usdcUnits: (raw: bigint) => string;
  usdcString: (s: string) => string;
  asset: (amount: string | number | undefined | null, asset?: string) => string;
  ethBalance: (v: bigint | string | number | null | undefined) => string;
  ethFee: (wei: bigint | string | number) => string;
  units: (value: bigint, decimals: number, maxDecimals?: number) => string;
  number: (text: string) => string;
}

const LANG_STORAGE_KEY = 'pukico.lang';

const TRANSLATIONS: Record<Lang, Translations> = {
  en,
  id,
};

function getInitialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'id') {
      return saved;
    }
    const browserLang = (
      navigator.language ||
      (navigator.languages && navigator.languages[0]) ||
      ''
    ).toLowerCase();
    return browserLang.startsWith('id') ? 'id' : 'en';
  } catch {
    return 'en';
  }
}

export interface LangContextType {
  lang: Lang;
  t: Translations;
  phase: LangPhase;
  changeLang: (newLang: Lang) => void;
  formatNumber: (
    value: number | string | null | undefined,
    options?: { minDecimals?: number; maxDecimals?: number }
  ) => string;
  formatDate: (
    date: Date | number | string,
    options?: Intl.DateTimeFormatOptions
  ) => string;
  fmt: LangFormatters;
}

const LangContext = createContext<LangContextType | null>(null);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(getInitialLang);
  const [phase, setPhase] = useState<LangPhase>('idle');

  // Sync document.documentElement.lang
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const changeLang = useCallback(
    (newLang: Lang) => {
      if (newLang === lang) return;

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        setLang(newLang);
        try {
          localStorage.setItem(LANG_STORAGE_KEY, newLang);
        } catch {
          // ignore
        }
        return;
      }

      // Transition phase: 'out' (120ms) -> change lang -> 'in' (280ms) -> 'idle'
      setPhase('out');
      window.setTimeout(() => {
        setLang(newLang);
        try {
          localStorage.setItem(LANG_STORAGE_KEY, newLang);
        } catch {
          // ignore
        }
        setPhase('in');
        window.setTimeout(() => {
          setPhase('idle');
        }, 280);
      }, 120);
    },
    [lang]
  );

  const formatNumber = useCallback(
    (
      value: number | string | null | undefined,
      options?: { minDecimals?: number; maxDecimals?: number }
    ): string => {
      if (value === null || value === undefined || value === '') return '—';

      const locale = lang === 'id' ? 'id-ID' : 'en-US';
      const minDec = options?.minDecimals ?? 2;
      const maxDec = options?.maxDecimals ?? 4;

      if (typeof value === 'number') {
        if (isNaN(value)) return '0.00';
        return new Intl.NumberFormat(locale, {
          minimumFractionDigits: minDec,
          maximumFractionDigits: maxDec,
        }).format(value);
      }

      const strVal = String(value).trim();

      // Handle special prefix like "< 0.0001"
      if (strVal.startsWith('<')) {
        const rest = strVal.replace('<', '').trim();
        const num = parseFloat(rest.replace(/,/g, ''));
        if (!isNaN(num)) {
          const formattedNum = new Intl.NumberFormat(locale, {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
          }).format(num);
          return `< ${formattedNum}`;
        }
        return strVal;
      }

      // Parse string representation
      const cleaned = strVal.replace(/,/g, '');
      const parsed = parseFloat(cleaned);
      if (isNaN(parsed)) return strVal;

      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: minDec,
        maximumFractionDigits: maxDec,
      }).format(parsed);
    },
    [lang]
  );

  const formatDate = useCallback(
    (
      date: Date | number | string,
      options?: Intl.DateTimeFormatOptions
    ): string => {
      const d = typeof date === 'object' ? date : new Date(date);
      if (isNaN(d.getTime())) return '';
      const locale = lang === 'id' ? 'id-ID' : 'en-US';
      return new Intl.DateTimeFormat(locale, options).format(d);
    },
    [lang]
  );

  const fmt = useMemo<LangFormatters>(
    () => ({
      usdcUnits: (raw: bigint) => localizeNumber(formatUsdcUnits(raw), lang),
      usdcString: (s: string) => localizeNumber(formatUsdcString(s), lang),
      asset: (amount, asset) => localizeNumber(formatAssetAmount(amount, asset), lang),
      ethBalance: (v) => localizeNumber(formatEthBalance(v), lang),
      ethFee: (wei) => localizeNumber(formatEthFee(wei), lang),
      units: (value: bigint, decimals: number, maxDecimals?: number) =>
        localizeNumber(formatUnitsTrimmed(value, decimals, maxDecimals), lang),
      number: (text: string) => localizeNumber(text, lang),
    }),
    [lang]
  );

  const value = useMemo<LangContextType>(
    () => ({
      lang,
      t: TRANSLATIONS[lang],
      phase,
      changeLang,
      formatNumber,
      formatDate,
      fmt,
    }),
    [lang, phase, changeLang, formatNumber, formatDate, fmt]
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useT(): LangContextType {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error('useT must be used within a LangProvider');
  }
  return ctx;
}

export const useLang = useT;
