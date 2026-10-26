import type { ReactNode } from 'react';

/** Pill toggle. Selected chips get a strong outline (not a fill), like the filter bar. */
export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-10 shrink-0 rounded-full border px-4 text-sm whitespace-nowrap transition-colors ${
        selected
          ? 'border-fg bg-surface text-fg font-semibold shadow-[inset_0_0_0_1px_var(--app-text)]'
          : 'border-line bg-bg text-fg hover:border-fg'
      }`}
    >
      {children}
    </button>
  );
}
