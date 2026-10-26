import type { ReactNode } from 'react';

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
      className={`min-h-10 rounded-full border px-4 text-sm font-medium transition-colors ${
        selected ? 'border-accent bg-accent text-accent-fg' : 'border-hint/30 bg-bg text-fg'
      }`}
    >
      {children}
    </button>
  );
}
