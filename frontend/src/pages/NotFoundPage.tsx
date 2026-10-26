import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-xl font-semibold">{t('notFound.title')}</h1>
      <Link to="/" className="bg-accent text-accent-fg rounded-full px-5 py-3 font-medium">
        {t('notFound.back')}
      </Link>
    </main>
  );
}
