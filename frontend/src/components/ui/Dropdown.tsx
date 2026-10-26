import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import { useMediaQuery } from '@/lib/useMediaQuery';

import { ChevronDownIcon } from './icons';
import { Sheet } from './Sheet';

const POPOVER_QUERY = '(min-width: 768px)';

interface Props {
  /** Trigger text (e.g. the category name, or the current selection). */
  label: ReactNode;
  /** Accessible name of the panel/sheet. */
  title: string;
  /** Highlight the trigger when this category has a value. */
  active?: boolean;
  icon?: ReactNode;
  align?: 'start' | 'end';
  /** Panel content; `close` dismisses the dropdown. */
  children: (close: () => void) => ReactNode;
  footer?: (close: () => void) => ReactNode;
  width?: string;
}

/**
 * Pill trigger with a popover panel on tablets/desktop and a bottom sheet on phones.
 * Filter categories and sorting share it so they look and behave the same.
 */
export function Dropdown({
  label,
  title,
  active = false,
  icon,
  align = 'start',
  children,
  footer,
  width = 'w-80',
}: Props) {
  const [open, setOpen] = useState(false);
  const popover = useMediaQuery(POPOVER_QUERY);
  const wrapper = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open || !popover) return;
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, popover]);

  return (
    <div ref={wrapper} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={`flex h-10 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap transition-colors ${
          active || open
            ? 'border-fg bg-surface font-semibold shadow-[inset_0_0_0_1px_var(--app-text)]'
            : 'border-line bg-bg hover:border-fg'
        }`}
      >
        {icon}
        {label}
        <ChevronDownIcon
          width={16}
          height={16}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && popover && (
        <section
          id={panelId}
          role="dialog"
          aria-label={title}
          className={`absolute top-full z-30 mt-2 ${width} border-line bg-bg shadow-card rounded-2xl border ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="max-h-[60vh] overflow-y-auto p-5">{children(close)}</div>
          {footer && <div className="border-line border-t px-5 py-3">{footer(close)}</div>}
        </section>
      )}
      {!popover && (
        <Sheet open={open} onClose={close} title={title} footer={footer?.(close)}>
          {children(close)}
        </Sheet>
      )}
    </div>
  );
}
