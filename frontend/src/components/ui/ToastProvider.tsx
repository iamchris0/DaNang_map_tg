import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { ToastContext, type ToastKind } from './toastContext';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

const DURATION_MS = 3500;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = nextId++;
    setToasts((current) => [...current.slice(-2), { id, message, kind }]);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, DURATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toasts]);

  return (
    <ToastContext value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+var(--safe-bottom))] z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={`max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.kind === 'error' ? 'bg-danger text-white' : 'bg-neutral-900 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
