import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useAuth } from '@/auth/useAuth';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { FilterIcon, ListIcon, MapIcon, SettingsIcon } from '@/components/ui/icons';
import type { CatalogView } from '@/features/filters/useCatalogState';

interface Props {
  view: CatalogView;
  onViewChange: (view: CatalogView) => void;
  activeFilters: number;
  onOpenFilters: () => void;
}

export function CatalogHeader({ view, onViewChange, activeFilters, onOpenFilters }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const views: { id: CatalogView; label: string; Icon: typeof MapIcon }[] = [
    { id: 'map', label: t('catalog.map'), Icon: MapIcon },
    { id: 'list', label: t('catalog.list'), Icon: ListIcon },
  ];

  return (
    <header className="bg-bg z-10 flex items-center gap-2 px-3 pt-[calc(0.5rem+var(--safe-top))] pb-2 shadow-sm">
      <h1 className="sr-only md:not-sr-only md:mr-2 md:text-lg md:font-bold">{t('app.name')}</h1>
      <div
        role="tablist"
        aria-label={t('catalog.views')}
        className="bg-surface flex rounded-full p-0.5"
      >
        {views.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => {
              onViewChange(id);
            }}
            className={`flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${
              view === id ? 'bg-bg text-fg shadow-sm' : 'text-hint'
            }`}
          >
            <Icon width={16} height={16} />
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        aria-label={
          activeFilters
            ? t('catalog.filtersActive', { count: activeFilters })
            : t('catalog.filters')
        }
        className="bg-surface ml-auto flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium"
      >
        <FilterIcon width={16} height={16} />
        <span className="hidden sm:inline">{t('catalog.filters')}</span>
        {activeFilters > 0 && (
          <span className="bg-accent text-accent-fg flex size-5 items-center justify-center rounded-full text-xs">
            {activeFilters}
          </span>
        )}
      </button>
      {user?.is_admin && (
        <Link
          to="/admin"
          aria-label={t('admin.open')}
          className="bg-surface flex size-9 shrink-0 items-center justify-center rounded-full"
        >
          <SettingsIcon width={18} height={18} />
        </Link>
      )}
      <LanguageSwitcher />
    </header>
  );
}
