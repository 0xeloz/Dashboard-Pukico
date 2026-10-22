import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Languages, ChevronDown, Check } from 'lucide-react';
import { useT, type Lang } from '../../i18n';

interface LanguageOption {
  code: Lang;
  label: string; // In native name, not translated
}

const OPTIONS: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'id', label: 'Bahasa Indonesia' },
];

export function LanguagePopover() {
  const { lang, t, changeLang } = useT();

  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const closeTimerRef = useRef<number | null>(null);
  const initialScrollYRef = useRef<number>(0);

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    transformOrigin: string;
  } | null>(null);

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(Math.max(rect.width * 0.45, 200), window.innerWidth * 0.9);
    const popoverHeight = 104; // 44px * 2 + 8px padding + 2px border
    const gap = 6;
    const padding = 12;

    // Right-aligned with trigger button
    let left = rect.right - popoverWidth;
    if (left < padding) {
      left = padding;
    }
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - padding - popoverWidth;
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    let top = rect.bottom + gap;
    let origin = 'top right';

    if (spaceBelow < popoverHeight + gap + padding && spaceAbove > spaceBelow) {
      top = rect.top - gap - popoverHeight;
      origin = 'bottom right';
    }

    top = Math.max(padding, Math.min(top, window.innerHeight - padding - popoverHeight));

    setCoords({
      top,
      left,
      width: popoverWidth,
      transformOrigin: origin,
    });
  }, []);

  const handleClose = useCallback(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setIsOpen(false);
      setMounted(false);
      setClosing(false);
      triggerRef.current?.focus();
      return;
    }

    setIsOpen(false);
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      closeTimerRef.current = null;
      triggerRef.current?.focus();
    }, 120);
  }, []);

  const handleOpen = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    initialScrollYRef.current = window.scrollY;
    const activeIdx = OPTIONS.findIndex((o) => o.code === lang);
    setFocusedIndex(activeIdx >= 0 ? activeIdx : 0);
    updateCoords();
    setMounted(true);
    setClosing(false);
    setIsOpen(true);
  };

  const handleToggle = () => {
    if (isOpen) {
      handleClose();
    } else {
      handleOpen();
    }
  };

  const handleSelect = (selectedLang: Lang) => {
    handleClose();
    // Prompt: "Setelah opsi dipilih: popover menutup, fokus kembali ke tombol pemicu, nilai di baris langsung berubah, lalu bahasa halaman berganti"
    changeLang(selectedLang);
  };

  // Re-calculate coords on resize and orientationchange
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowChange = () => {
      updateCoords();
    };

    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('orientationchange', handleWindowChange);

    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('orientationchange', handleWindowChange);
    };
  }, [isOpen, updateCoords]);

  // Close on large scroll (threshold 20px), hashchange, or popstate
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => {
      if (Math.abs(window.scrollY - initialScrollYRef.current) > 20) {
        handleClose();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('popstate', handleClose);
    window.addEventListener('hashchange', handleClose);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('popstate', handleClose);
      window.removeEventListener('hashchange', handleClose);
    };
  }, [isOpen, handleClose]);

  // Focus active option on open
  useEffect(() => {
    if (isOpen && mounted && !closing) {
      const timer = setTimeout(() => {
        optionRefs.current[focusedIndex]?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen, mounted, closing, focusedIndex]);

  // Keyboard navigation within popover
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = (prev + 1) % OPTIONS.length;
        optionRefs.current[next]?.focus();
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = (prev - 1 + OPTIONS.length) % OPTIONS.length;
        optionRefs.current[next]?.focus();
        return next;
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIndex(0);
      optionRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = OPTIONS.length - 1;
      setFocusedIndex(last);
      optionRefs.current[last]?.focus();
    }
  };

  const activeOption = OPTIONS.find((o) => o.code === lang) || OPTIONS[0];

  return (
    <>
      {/* 52px Flat Row Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${t.settings.language}: ${activeOption.label}`}
        className="w-full h-[52px] flex items-center justify-between py-0 border-b border-[#E5E7EB] hover:bg-[#EEF4FF]/50 transition-colors duration-150 cursor-pointer active:scale-[0.99] text-left outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF]"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] flex items-center justify-center shrink-0">
            <Languages className="w-5 h-5 text-[#0052FF]" />
          </div>
          <span className="text-sm font-medium text-[#0A0B0D]">
            {t.settings.language}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-[#5B6577] font-medium">
            {activeOption.label}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[#5B6577] transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Popover rendered via Portal to document.body */}
      {mounted && typeof document !== 'undefined' && coords &&
        createPortal(
          <div className="fixed inset-0 z-50 pointer-events-auto">
            {/* Transparent backdrop layer to capture outside clicks */}
            <div
              className="fixed inset-0 bg-transparent"
              onClick={handleClose}
              aria-hidden="true"
            />

            {/* Popover container */}
            <div
              ref={popoverRef}
              role="listbox"
              tabIndex={-1}
              aria-label={t.settings.language}
              onKeyDown={handleKeyDown}
              style={{
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: `${coords.width}px`,
                transformOrigin: coords.transformOrigin,
                boxShadow: '0 8px 24px rgba(10,11,13,0.10)',
              }}
              className={`z-50 bg-white border border-[#E5E7EB] rounded-[14px] p-1 outline-none ${
                closing ? 'animate-popover-out' : 'animate-popover-in'
              }`}
            >
              {OPTIONS.map((opt, idx) => {
                const isSelected = opt.code === lang;
                return (
                  <button
                    key={opt.code}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt.code)}
                    onMouseEnter={() => setFocusedIndex(idx)}
                    className="w-full h-11 px-3 rounded-[10px] flex items-center justify-between text-[15px] font-medium text-[#0A0B0D] hover:bg-[#EEF4FF] focus-visible:bg-[#EEF4FF] active:bg-[#EEF4FF] transition-colors duration-100 cursor-pointer outline-none"
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-[#0052FF] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
