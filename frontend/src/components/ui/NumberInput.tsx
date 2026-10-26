import { useId, useState } from 'react';

interface Props {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
}

/** Numeric input that keeps partially typed text (e.g. "8.") while emitting parsed values. */
export function NumberInput({ label, value, onChange, step = 1 }: Props) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));
  const [lastValue, setLastValue] = useState(value);

  // Follow external changes such as "Reset" without clobbering partially typed text.
  if (value !== lastValue) {
    setLastValue(value);
    const parsed = text.trim() === '' ? null : Number(text.replace(',', '.'));
    if (parsed !== value) setText(value === null ? '' : String(value));
  }

  return (
    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-hint text-xs">{label}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        step={step}
        onChange={(event) => {
          const next = event.target.value.replace(/[^\d.,]/g, '');
          setText(next);
          const parsed = next === '' ? null : Number(next.replace(',', '.'));
          if (parsed === null || (Number.isFinite(parsed) && parsed >= 0)) onChange(parsed);
        }}
        className="border-hint/30 bg-bg focus:border-accent min-h-11 w-full rounded-xl border px-3 text-base outline-none"
      />
    </label>
  );
}
