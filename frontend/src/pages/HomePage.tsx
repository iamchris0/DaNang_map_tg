import { useTranslation } from 'react-i18next';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SystemStatus } from '@/components/SystemStatus';

export function HomePage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('app.name')}</h1>
          <p className="text-hint">{t('app.tagline')}</p>
        </div>
        <LanguageSwitcher />
      </header>
      <p className="bg-surface text-hint rounded-2xl p-4">{t('home.comingSoon')}</p>
      <SystemStatus />
    </main>
  );
}
