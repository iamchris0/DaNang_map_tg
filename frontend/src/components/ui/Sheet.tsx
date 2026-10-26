import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CloseIcon } from './icons';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually hide the title (it still labels the dialog). */
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** "panel" overlays the map without a backdrop; "modal" dims the page. */
  variant?: 'panel' | 'modal';
}

const DISMISS_DISTANCE = 80;

/**
 * Bottom sheet on phones; on wider screens a floating side panel (panel) or centred dialog
 * (modal). Drag the handle down to dismiss.
 */
export function Sheet({
  open,
  onClose,
  title,
  hideTitle = false,
  children,
  footer,
  variant = 'modal',
}: SheetProps) {
  const { t } = useTranslation();
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const modal = variant === 'modal';
  const placement = modal
    ? 'inset-x-0 bottom-0 max-h-[85dvh] md:inset-auto md:top-1/2 md:left-1/2 md:w-[28rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl'
    : 'inset-x-0 bottom-0 max-h-[70dvh] md:inset-auto md:top-3 md:bottom-auto md:left-3 md:w-96 md:max-h-[calc(100%-1.5rem)] md:rounded-2xl';

  return (
    <>
      {modal && (
        <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/40" onClick={onClose} />
      )}
      <section
        role="dialog"
        aria-modal={modal}
        aria-label={title}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        className={`${modal ? 'fixed z-40' : 'absolute z-20'} ${placement} bg-bg text-fg flex flex-col rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.18)]`}
      >
        <div
          className="flex cursor-grab touch-none justify-center pt-2 pb-1 md:hidden"
          onPointerDown={(event) => {
            startY.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (startY.current !== null) setDragY(Math.max(0, event.clientY - startY.current));
          }}
          onPointerUp={() => {
            if (dragY > DISMISS_DISTANCE) onClose();
            startY.current = null;
            setDragY(0);
          }}
        >
          <span className="bg-hint/40 h-1 w-10 rounded-full" />
        </div>
        <header
          className={`flex items-center gap-2 px-4 ${hideTitle ? 'absolute top-2 right-2 z-10 px-0' : 'pt-1 pb-2'}`}
        >
          <h2 className={hideTitle ? 'sr-only' : 'flex-1 text-lg font-semibold'}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="bg-surface/90 text-hint flex size-9 items-center justify-center rounded-full"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </div>
        {footer && (
          <footer className="border-hint/15 border-t px-4 pt-3 pb-[max(0.75rem,var(--safe-bottom))]">
            {footer}
          </footer>
        )}
      </section>
    </>
  );
}
