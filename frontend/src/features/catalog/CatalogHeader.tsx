import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useDistricts } from '@/api/catalog';
import { useAuth } from '@/auth/useAuth';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SearchIcon, SettingsIcon } from '@/components/ui/icons';
import { Logo } from '@/components/ui/Logo';
import type { CatalogFilters } from '@/features/filters/filters';

import { summarize } from './filterSummary';

interface Props {
  filters: CatalogFilters;
  onOpenFilters: () => void;
}

export function CatalogHeader({ filters, onOpenFilters }: Props) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const districts = useDistricts();
  const summary = summarize(t, filters, districts.data, i18n.resolvedLanguage ?? 'en');

  return (
    <header className="border-line bg-bg z-10 border-b px-4 pt-[calc(0.75rem+var(--safe-top))] pb-3 lg:px-10">
      <div className="flex items-center gap-3">
        <Link to="/" className="hidden shrink-0 lg:block" aria-label={t('app.name')}>
          <Logo label={t('app.name')} />
        </Link>
        <h1 className="sr-only">{t('app.name')}</h1>

        {/* Phone: one pill with a two-line summary. */}
        <button
          type="button"
          onClick={onOpenFilters}
          aria-label={t('catalog.search')}
          className="border-line bg-bg shadow-card flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-full border px-4 text-left lg:hidden"
        >
          <SearchIcon className="shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{summary.where}</span>
            <span className="text-hint block truncate text-xs">
              {summary.rent} · {summary.size}
            </span>
          </span>
        </button>

        {/* Desktop: segmented search pill. */}
        <div className="border-line bg-bg shadow-card mx-auto hidden items-center rounded-full border py-1.5 pr-1.5 pl-2 lg:flex">
          {(
            [
              ['where', summary.where],
              ['rent', summary.rent],
              ['size', summary.size],
            ] as const
          ).map(([key, value], index) => (
            <button
              key={key}
              type="button"
              onClick={onOpenFilters}
              className={`hover:bg-surface max-w-56 rounded-full px-5 py-1.5 text-left ${
                index > 0 ? 'border-line border-l' : ''
              }`}
            >
              <span className="block text-xs font-semibold">{t(`catalog.${key}`)}</span>
              <span className="text-hint block truncate text-sm">{value}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenFilters}
            aria-label={t('catalog.search')}
            className="bg-accent text-accent-fg ml-2 flex size-12 items-center justify-center rounded-full"
          >
            <SearchIcon />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:ml-0">
          <LanguageSwitcher />
          {user?.is_admin && (
            <Link
              to="/admin"
              aria-label={t('admin.open')}
              className="border-line bg-bg hover:shadow-card flex size-10 items-center justify-center rounded-full border"
            >
              <SettingsIcon width={18} height={18} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
