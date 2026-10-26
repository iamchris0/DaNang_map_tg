import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node >= 25 ships its own (file-backed, here non-functional) `localStorage` global that
// shadows jsdom's. Replace it with an in-memory Storage for tests.
if (typeof (globalThis.localStorage as Partial<Storage> | undefined)?.clear !== 'function') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
}

const { default: i18n } = await import('@/i18n');

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await i18n.changeLanguage('en');
});
