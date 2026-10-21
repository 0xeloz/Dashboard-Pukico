import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  triggerRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

export function BottomSheet({
  open,
  onClose,
  title,
  triggerRef,
  children,
}: BottomSheetProps) {
  // Store onClose in a ref so useEffect does NOT re-run when parent re-renders
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const triggerRefCurrent = useRef(triggerRef);
  triggerRefCurrent.current = triggerRef;

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Animation states: mounted and closing
  const [mounted, setMounted] = useState<boolean>(open);
  const [closing, setClosing] = useState<boolean>(false);

  // Manage mounted / closing states
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      // Check prefers-reduced-motion
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        setMounted(false);
        setClosing(false);
      } else {
        setClosing(true);
        const timer = setTimeout(() => {
          setMounted(false);
          setClosing(false);
        }, 220);
        return () => clearTimeout(timer);
      }
    }
  }, [open, mounted]);

  // Effect for history state, scroll locking, and focus trap - DEPENDS ONLY ON [open]
  useEffect(() => {
    if (!open) return;

    let pushed = false;
    const previousActiveElement = (triggerRefCurrent.current?.current || document.activeElement) as HTMLElement | null;

    // 1. Lock scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 2. History push
    try {
      window.history.pushState({ pukicoSheet: true }, '');
      pushed = true;
    } catch {
      // ignore
    }

    // 3. Popstate listener
    const handlePopState = () => {
      pushed = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);

    // 4. Focus sheet
    const focusTimer = setTimeout(() => {
      sheetRef.current?.focus();
    }, 50);

    // Cleanup: called only when open changes from true to false or unmount
    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('popstate', handlePopState);

      // ONLY if pushed is still true (closed via X, backdrop, Escape, or "Got it", NOT via Back)
      if (pushed) {
        pushed = false;
        try {
          window.history.back();
        } catch {
          // ignore
        }
      }

      previousActiveElement?.focus();
    };
  }, [open]);

  // Escape key & tab key trap
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }

      if (e.key === 'Tab' && sheetRef.current) {
        const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Touch drag to dismiss on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - dragStartRef.current;
    if (delta > 0) {
      setDragOffset(delta);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragOffset > 80) {
      onCloseRef.current();
    }
    setDragOffset(0);
    dragStartRef.current = null;
  };

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
    >
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-[#0A0B0D]/40 backdrop-blur-xs ${
          closing ? 'animate-backdrop-out' : 'animate-backdrop-in'
        }`}
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />

      {/* Sheet (Mobile) / Modal (Desktop) */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`relative z-10 w-full max-w-[560px] max-h-[85dvh] bg-white rounded-t-[24px] lg:rounded-[24px] shadow-2xl flex flex-col overflow-hidden outline-none ${
          isDragging
            ? ''
            : closing
            ? 'animate-sheet-out lg:animate-modal-out'
            : 'animate-sheet-in lg:animate-modal-in'
        }`}
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        }}
      >
        {/* Mobile Drag Handle Bar */}
        <div
          className="lg:hidden w-full pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-9 h-1 bg-[#D1D5DB] rounded-full mx-auto" />
        </div>

        {/* Header (18px bold title left, 36px close button X right) */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b border-[#E5E7EB] shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <h2 id="bottom-sheet-title" className="text-[18px] font-bold text-[#0A0B0D] leading-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="w-9 h-9 rounded-full hover:bg-[#EEF4FF] text-[#5B6577] hover:text-[#0A0B0D] flex items-center justify-center transition-colors cursor-pointer active:scale-[0.95]"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 pb-safe space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}
