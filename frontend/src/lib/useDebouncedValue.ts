import { useEffect, useState } from 'react';

/** Returns `value` once it has stopped changing for `delayMs`. Compared by JSON shape. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  const key = JSON.stringify(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
    };
    // `key` captures value changes by content, not identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs]);

  return debounced;
}
