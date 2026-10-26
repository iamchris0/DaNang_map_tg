import { useTranslation } from 'react-i18next';

import { changeLanguage, SUPPORTED_LANGUAGES } from '@/i18n';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <div role="group" aria-label={t('language.label')} className="bg-surface flex rounded-full p-1">
      {SUPPORTED_LANGUAGES.map((language) => {
        const active = i18n.resolvedLanguage === language;
        return (
          <button
            key={language}
            type="button"
            aria-pressed={active}
            onClick={() => void changeLanguage(language)}
            className={`min-h-9 min-w-11 rounded-full px-3 text-sm font-medium transition-colors ${
              active ? 'bg-accent text-accent-fg' : 'text-hint'
            }`}
          >
            {language.toUpperCase()}
            <span className="sr-only"> — {t(`language.${language}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
