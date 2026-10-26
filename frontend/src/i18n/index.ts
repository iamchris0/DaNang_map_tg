import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getLanguageHint } from '@/telegram/webapp';

import en from './locales/en.json';
import ru from './locales/ru.json';

export const SUPPORTED_LANGUAGES = ['en', 'ru'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'dna.language';

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function hasStoredLanguage(): boolean {
  return readStoredLanguage() !== null;
}

/** Resolution order: manual choice (localStorage) → Telegram user language → English. */
export function resolveInitialLanguage(hint?: string | null): Language {
  const stored = readStoredLanguage();
  if (stored) return stored;
  const base = hint?.toLowerCase().split('-')[0];
  return isSupportedLanguage(base) ? base : 'en';
}

export async function changeLanguage(language: Language): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage may be unavailable (private mode); the choice still applies for this session.
  }
  await i18n.changeLanguage(language);
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ru: { translation: ru } },
  lng: resolveInitialLanguage(getLanguageHint()),
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
  returnNull: false,
});

document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
