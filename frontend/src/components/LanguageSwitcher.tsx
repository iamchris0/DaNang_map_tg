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
      className="border-line bg-bg flex shrink-0 rounded-full border p-0.5"
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
            className={`min-h-8 min-w-9 rounded-full px-2 text-xs font-bold transition-colors ${
              active ? 'bg-fg text-bg' : 'text-hint hover:text-fg'
            }`}
          >
            {language.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
