import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useAuth } from '@/auth/useAuth';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SettingsIcon } from '@/components/ui/icons';
import { Logo } from '@/components/ui/Logo';
import type { CatalogFilters } from '@/features/filters/filters';
import { useMediaQuery } from '@/lib/useMediaQuery';

import { FilterDropdowns } from './FilterDropdowns';

interface Props {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
}

/** Logo, category filters and settings. Phones get the filters on a scrollable second row. */
export function CatalogHeader({ filters, onChange }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Same breakpoint as the dropdown popovers (phones use bottom sheets).
  const wide = useMediaQuery('(min-width: 768px)');

  const actions = (
    <div className="flex shrink-0 items-center gap-2">
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
  );

  return (
    <header className="border-line bg-bg z-20 border-b pt-[calc(0.75rem+var(--safe-top))] pb-3">
      <h1 className="sr-only">{t('app.name')}</h1>
      <div className="flex items-center gap-4 px-4 lg:px-10">
        <Link to="/" className="shrink-0" aria-label={t('app.name')}>
          <Logo label={t('app.name')} withWordmark={wide} />
        </Link>
        {wide && (
          <div className="flex-1">
            <FilterDropdowns filters={filters} onChange={onChange} />
          </div>
        )}
        <div className="ml-auto">{actions}</div>
      </div>
      {/* Phones: horizontally scrollable filter row (panels open as bottom sheets). */}
      {!wide && (
        <div className="no-scrollbar mt-3 overflow-x-auto px-4">
          <FilterDropdowns filters={filters} onChange={onChange} />
        </div>
      )}
    </header>
  );
}
