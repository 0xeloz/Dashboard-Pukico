import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { useToast, type ActiveToast, type ToastKind } from '../../context/ToastContext';

function ToastIcon({ kind }: { kind: ToastKind }) {
  switch (kind) {
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
  const isError = toast.kind === 'error';

  const handleMouseEnter = () => {
    setIsHovered(true);
    onPause(toast.id);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onResume(toast.id);
  };

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleMouseEnter}
      onTouchEnd={handleMouseLeave}
      onTouchCancel={handleMouseLeave}
      className="pointer-events-auto w-full bg-white border border-[#E5E7EB] rounded-2xl shadow-xl p-3 flex items-start gap-3 animate-toast-in select-none transition-transform"
      style={{
        transform: isHovered ? 'scale(1.01)' : 'none',
      }}
    >
      <ToastIcon kind={toast.kind} />
      <div className="flex-1 min-w-0 pt-1">
        <p className="text-xs font-medium text-[#0A0B0D] leading-relaxed break-words">
          {toast.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Close notification"
        className="min-w-[44px] min-h-[44px] w-11 h-11 -mr-2 -mt-2 rounded-xl text-[#5B6577] hover:text-[#0A0B0D] hover:bg-[#F3F4F6] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
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
