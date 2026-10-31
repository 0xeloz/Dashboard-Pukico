import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from '../../i18n';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  title: string;
  triggerRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  disableBackdropClick?: boolean;
  contentClassName?: string;
  sheetClassName?: string;
}

export function BottomSheet({
  open,
  onClose,
  onClosed,
  title,
  triggerRef,
  children,
  disableBackdropClick = false,
  contentClassName,
  sheetClassName,
}: BottomSheetProps) {
  const { t } = useT();

  // Store onClose in a ref so effects do NOT re-run when parent re-renders
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const triggerRefCurrent = useRef(triggerRef);
  triggerRefCurrent.current = triggerRef;

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Animation states: mounted, entered, and closing
  const [mounted, setMounted] = useState<boolean>(open);
  const [closing, setClosing] = useState<boolean>(false);
  const [entered, setEntered] = useState<boolean>(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manage mounted / closing states
  useEffect(() => {
    if (open) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setMounted(true);
      setClosing(false);
      setEntered(false);
      setDragOffset(0);
    } else if (mounted) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        setMounted(false);
        setClosing(false);
        setEntered(false);
        onClosedRef.current?.();
      } else {
        setClosing(true);
        closeTimerRef.current = setTimeout(() => {
          setMounted(false);
          setClosing(false);
          setEntered(false);
          closeTimerRef.current = null;
          onClosedRef.current?.();
        }, 220);
      }
    }

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, [open, mounted]);

  // Lock body scroll and manage focus
  useEffect(() => {
    if (!mounted) return;

    const previousActiveElement = (triggerRefCurrent.current?.current || document.activeElement) as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => {
      sheetRef.current?.focus();
    }, 50);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      previousActiveElement?.focus?.();
    };
  }, [mounted]);

  // Escape key & tab key trap
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!disableBackdropClick) {
          e.preventDefault();
          onCloseRef.current();
        }
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
  }, [open, disableBackdropClick]);

  // Touch drag to dismiss on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (disableBackdropClick) return;
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
    dragStartRef.current = null;
    if (dragOffset > 80) {
      // Dragged more than 80px: close sheet without resetting dragOffset so exit starts from dragged position
      onCloseRef.current();
    } else {
      // Released less than 80px: return smoothly to 0
      setDragOffset(0);
    }
  };

  const handleAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target === sheetRef.current && !closing) {
      setEntered(true);
    }
  };

  if (!mounted || typeof document === 'undefined') return null;

  let animClass = '';
  if (isDragging) {
    animClass = '';
  } else if (closing) {
    animClass = 'animate-sheet-out lg:animate-modal-out';
  } else if (!entered) {
    animClass = 'animate-sheet-in lg:animate-modal-in';
  } else {
    animClass = 'transition-transform duration-200 ease-out';
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
    >
      {/* Backdrop (bg rgba(10,11,13,0.4)) */}
      <div
        className={`fixed inset-0 bg-[#0A0B0D]/40 ${
          closing ? 'animate-backdrop-out' : 'animate-backdrop-in'
        }`}
        onClick={() => {
          if (!disableBackdropClick) {
            onCloseRef.current();
          }
        }}
        aria-hidden="true"
      />

      {/* Sheet (Mobile) / Modal (Desktop) */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        onAnimationEnd={handleAnimationEnd}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 w-full max-w-[560px] ${
          sheetClassName ?? 'max-h-[85dvh]'
        } bg-white rounded-t-[24px] lg:rounded-[24px] shadow-2xl flex flex-col overflow-hidden outline-none ${animClass}`}
        style={{
          transform: dragOffset > 0 && !closing ? `translateY(${dragOffset}px)` : undefined,
          ['--drag-y' as any]: `${dragOffset}px`,
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
            className="w-9 h-9 rounded-full hover:bg-[#EEF4FF] text-[#5B6577] hover:text-[#0A0B0D] flex items-center justify-center transition-transform duration-[var(--dur-tap)] cursor-pointer active:scale-[0.97]"
            aria-label={t.common.closeDialog}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div
          className={`flex-1 min-h-0 ${
            contentClassName !== undefined
              ? contentClassName
              : 'overflow-y-auto px-5 sheet-body-pad pt-5 space-y-4'
          }`}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
