import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/useAuth';
import { changeLanguage, SUPPORTED_LANGUAGES } from '@/i18n';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const { saveLanguage } = useAuth();

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className="bg-surface flex shrink-0 rounded-full p-0.5"
    >
      {SUPPORTED_LANGUAGES.map((language) => {
        const active = i18n.resolvedLanguage === language;
        return (
          <button
            key={language}
            type="button"
            aria-pressed={active}
            aria-label={t(`language.${language}`)}
            onClick={() => {
              void changeLanguage(language);
              saveLanguage(language);
            }}
            className={`min-h-9 min-w-10 rounded-full px-2 text-xs font-semibold transition-colors ${
              active ? 'bg-accent text-accent-fg' : 'text-hint'
            }`}
          >
            {language.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
