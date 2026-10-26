import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Node >= 25 ships its own (file-backed, here non-functional) `localStorage` global that
// shadows jsdom's. Replace web storage with in-memory versions for tests.
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
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
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (typeof (globalThis[name] as Partial<Storage> | undefined)?.clear !== 'function') {
    Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true });
  }
}

// jsdom lacks matchMedia; default to a phone-sized viewport.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// MapLibre needs WebGL; tests use a DOM-only fake (see fakeMaplibre.ts).
vi.mock('maplibre-gl', async () => (await import('./fakeMaplibre')).maplibreModule);
vi.mock('@/features/map/webgl', () => ({ hasWebGL: () => true }));

const { default: i18n } = await import('@/i18n');
const { setSessionToken } = await import('@/api/session');
const { resetStartParamForTests } = await import('@/telegram/webapp');
const { maps } = await import('./fakeMaplibre');
const { resetLoginForTests } = await import('@/auth/login');

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  setSessionToken(null);
  resetStartParamForTests();
  resetLoginForTests();
  maps.length = 0;
  delete (window as unknown as { Telegram?: unknown }).Telegram;
  await i18n.changeLanguage('en');
});
