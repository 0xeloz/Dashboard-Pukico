import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import { useToast, type ActiveToast, type ToastKind } from '../../context/ToastContext';

function ToastIcon({ kind }: { kind: ToastKind }) {
  switch (kind) {
    case 'loading':
      return (
        <div className="w-8 h-8 rounded-xl bg-[#EEF4FF] text-[#0052FF] flex items-center justify-center shrink-0">
          <Loader2 className="w-4 h-4 animate-spin stroke-[2.2]" />
        </div>
      );
    case 'success':
      return (
        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#047857] flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    case 'error':
      return (
        <div className="w-8 h-8 rounded-xl bg-red-50 text-[#DC2626] flex items-center justify-center shrink-0">
          <AlertCircle className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    case 'warning':
      return (
        <div className="w-8 h-8 rounded-xl bg-amber-50 text-[#D97706] flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
    case 'info':
    default:
      return (
        <div className="w-8 h-8 rounded-xl bg-[#EEF4FF] text-[#0052FF] flex items-center justify-center shrink-0">
          <Info className="w-4 h-4 stroke-[2.2]" />
        </div>
      );
  }
}

interface ToastItemProps {
  toast: ActiveToast;
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}

function ToastItem({ toast, onDismiss, onPause, onResume }: ToastItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const touchStartYRef = useRef<number | null>(null);
  const [touchDeltaY, setTouchDeltaY] = useState(0);

  const isError = toast.kind === 'error';
  const isPersist = Boolean(toast.persist);

  const handleMouseEnter = () => {
    setIsHovered(true);
    onPause(toast.id);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onResume(toast.id);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    setIsHovered(true);
    onPause(toast.id);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const delta = e.touches[0].clientY - touchStartYRef.current;
    if (delta < 0) {
      setTouchDeltaY(delta);
    }
  };

  const handleTouchEnd = () => {
    setIsHovered(false);
    onResume(toast.id);
    if (touchDeltaY < -30) {
      onDismiss(toast.id);
    }
    touchStartYRef.current = null;
    setTouchDeltaY(0);
  };

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`pointer-events-auto relative w-full overflow-hidden bg-white border border-[#E5E7EB] rounded-2xl shadow-xl select-none transition-all duration-200 ${
        toast.isDismissing
          ? 'opacity-0 -translate-y-4 scale-95'
          : 'animate-toast-in'
      }`}
      style={{
        transform:
          touchDeltaY < 0
            ? `translateY(${touchDeltaY}px)`
            : isHovered && !toast.isDismissing
            ? 'scale(1.01)'
            : undefined,
      }}
    >
      <div className="p-3 flex items-start gap-3">
        <ToastIcon kind={toast.kind} />

        <div className="flex-1 min-w-0 pt-0.5">
          {toast.title && (
            <p className="text-xs font-bold text-[#0A0B0D] mb-0.5">
              {toast.title}
            </p>
          )}
          {(!toast.title || toast.title.trim().toLowerCase() !== toast.message.trim().toLowerCase()) && Boolean(toast.message?.trim()) && (
            <p className="text-xs font-medium text-[#0A0B0D] leading-relaxed break-words">
              {toast.message}
            </p>
          )}

          {toast.action && (
            <div className="mt-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
                className="px-2.5 py-1 text-xs font-bold text-[#0052FF] bg-[#EEF4FF] hover:bg-[#DCE8FF] rounded-lg transition-colors cursor-pointer"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>

        {/* 44x44 target close button without pushing layout */}
        <div className="shrink-0 -mr-2 -mt-2">
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Close notification"
            className="w-11 h-11 flex items-center justify-center text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6] rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Thin duration progress bar at the bottom */}
      {!isPersist && toast.duration > 0 && !toast.isDismissing && (
        <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#F3F4F6] overflow-hidden">
          <div
            className={`h-full transition-all linear ${
              toast.kind === 'error'
                ? 'bg-[#DC2626]'
                : toast.kind === 'warning'
                ? 'bg-[#D97706]'
                : toast.kind === 'success'
                ? 'bg-[#047857]'
                : 'bg-[#0052FF]'
            }`}
            style={{
              width: isHovered ? '100%' : '0%',
              transitionDuration: isHovered ? '0ms' : `${toast.duration}ms`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastViewport() {
  const { toasts, dismissToast, pauseToast, resumeToast } = useToast();

  if (typeof document === 'undefined') return null;
  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed top-0 left-1/2 -translate-x-1/2 z-[70] pointer-events-none flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] w-full max-w-sm sm:max-w-md"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={dismissToast}
          onPause={pauseToast}
          onResume={resumeToast}
        />
      ))}
    </div>,
    document.body
  );
}
