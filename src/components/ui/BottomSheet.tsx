import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const isHistoryPushed = useRef<boolean>(false);

  // Focus management & body scroll lock
  useEffect(() => {
    if (open) {
      previousActiveElement.current = (triggerRef?.current || document.activeElement) as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Push history state so Android/browser back button closes sheet
      if (!isHistoryPushed.current) {
        window.history.pushState({ pukicoSheet: true }, '');
        isHistoryPushed.current = true;
      }

      const handlePopState = (e: PopStateEvent) => {
        isHistoryPushed.current = false;
        onClose();
      };
      window.addEventListener('popstate', handlePopState);

      // Focus sheet after animation
      const focusTimer = setTimeout(() => {
        sheetRef.current?.focus();
      }, 50);

      return () => {
        clearTimeout(focusTimer);
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('popstate', handlePopState);
        if (isHistoryPushed.current) {
          isHistoryPushed.current = false;
          // Clean up state if closed by other means without extra back-step
          try {
            if (window.history.state?.pukicoSheet) {
              window.history.back();
            }
          } catch {
            // ignore
          }
        }
        previousActiveElement.current?.focus();
      };
    }
  }, [open, onClose, triggerRef]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      // Basic focus trap
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
  }, [open, onClose]);

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
      onClose();
    }
    setDragOffset(0);
    dragStartRef.current = null;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bottom-sheet-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#0A0B0D]/40 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet / Modal Container */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`relative z-10 w-full lg:max-w-[420px] max-h-[85dvh] bg-white rounded-t-[24px] lg:rounded-[24px] shadow-2xl flex flex-col overflow-hidden outline-none ${
          isDragging ? '' : 'transition-transform duration-320 ease-[cubic-bezier(0.16,1,0.3,1)]'
        }`}
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
        }}
      >
        {/* Mobile Drag Handle Bar */}
        <div
          className="lg:hidden w-full pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-9 h-1 bg-[#D1D5DB] rounded-full mx-auto" />
        </div>

        {/* Header (18px bold title left, 36px close button right) */}
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
            onClick={onClose}
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
