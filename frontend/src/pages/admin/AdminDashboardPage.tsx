import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useAdminApartments, useDashboard } from '@/api/admin';
import type { ApartmentStatus } from '@/api/types';
import { PlusIcon, SearchIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { ListingTile } from '@/features/admin/ListingTile';
import { STATUSES } from '@/features/admin/status';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ApartmentStatus | null>(null);
  const dashboard = useDashboard();
  const list = useAdminApartments(useDebouncedValue(search.trim(), 300), status);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  // One row of status filters, each with its count (no separate statistics block).
  const tabs: { key: ApartmentStatus | null; label: string; count: number | undefined }[] = [
    { key: null, label: t('admin.status.all'), count: dashboard.data?.total },
    ...STATUSES.map((s) => ({
      key: s,
      label: t(`admin.status.${s}`),
      count: dashboard.data?.[s],
    })),
  ];

  return (
    <div className="space-y-5 px-4 pt-5 pb-[calc(2rem+var(--safe-bottom))] lg:px-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-2xl font-semibold">{t('admin.listings')}</h2>
        <label className="border-line bg-bg focus-within:border-fg flex h-11 w-full items-center gap-2 rounded-full border px-4 sm:w-72">
          <SearchIcon width={18} height={18} className="text-hint" />
          <span className="sr-only">{t('admin.search')}</span>
          <input
            type="search"
            value={search}
            placeholder={t('admin.search')}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <Link
          to="/admin/apartments/new"
          className="bg-accent text-accent-fg flex h-11 w-full items-center justify-center gap-2 rounded-full px-5 font-semibold sm:w-auto"
        >
          <PlusIcon width={18} height={18} />
          {t('admin.addApartment')}
        </Link>
      </div>

      <div
        role="group"
        aria-label={t('admin.manage')}
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0"
      >
        {tabs.map((tab) => {
          const selected = status === tab.key;
          return (
            <button
              key={tab.label}
              type="button"
              aria-pressed={selected}
              aria-label={
                tab.count === undefined
                  ? tab.label
                  : t('admin.statusCount', { label: tab.label, count: tab.count })
              }
              onClick={() => {
                setStatus(tab.key);
              }}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap ${
                selected
                  ? 'border-fg bg-fg text-bg font-semibold'
                  : 'border-line bg-bg hover:border-fg'
              }`}
            >
              {tab.label}
              <span
                className={`min-w-6 rounded-full px-1.5 text-xs font-semibold ${
                  selected ? 'bg-bg/20 text-bg' : 'bg-surface text-hint'
                }`}
              >
                {tab.count ?? '–'}
              </span>
            </button>
          );
        })}
      </div>

      {list.isPending ? (
        <div className="text-hint flex justify-center py-16">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="text-hint py-16 text-center">
          {search || status ? t('admin.noResults') : t('admin.empty')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((item) => (
            <ListingTile key={item.id} item={item} />
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <button
          type="button"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
          className="border-fg mx-auto flex h-11 items-center rounded-full border px-6 font-semibold"
        >
          {t('admin.loadMore')}
        </button>
      )}
    </div>
  );
}
