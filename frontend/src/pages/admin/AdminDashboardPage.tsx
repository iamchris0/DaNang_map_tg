import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useAdminApartments, useDashboard } from '@/api/admin';
import type { AdminListItem, ApartmentStatus } from '@/api/types';
import { Chip } from '@/components/ui/Chip';
import { PlusIcon, SearchIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { StatusActions } from '@/features/admin/StatusActions';
import { StatusBadge } from '@/features/admin/StatusBadge';
import { STATUSES } from '@/features/admin/status';
import { ApartmentPhoto } from '@/features/apartment/ApartmentPhoto';
import { districtName, formatDate, formatPriceFull } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

function ListingCard({ item }: { item: AdminListItem }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const title = item.title ?? t('admin.untitled');

  return (
    <li className="bg-surface flex gap-3 rounded-2xl p-3">
      <ApartmentPhoto
        image={item.cover_image}
        alt={title}
        sizes="96px"
        className="size-24 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={item.status} />
          <span className="text-hint text-xs">
            {t(`admin.publication.${item.publication_status ?? 'none'}`)}
          </span>
        </div>
        <h3 className="truncate font-semibold">{title}</h3>
        <p className="text-sm">
          {item.price_vnd !== null ? formatPriceFull(item.price_vnd, language) : t('admin.noPrice')}
          {item.district && (
            <span className="text-hint"> · {districtName(item.district, language)}</span>
          )}
        </p>
        <p className="text-hint text-xs">
          {t('admin.updated', { date: formatDate(item.updated_at, language) })}
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            to={`/admin/apartments/${item.id}`}
            className="bg-bg text-accent flex min-h-9 items-center rounded-xl px-3 text-sm font-semibold"
          >
            {t('admin.edit')}
          </Link>
          <StatusActions apartmentId={item.id} status={item.status} compact />
        </div>
      </div>
    </li>
  );
}

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ApartmentStatus | null>(null);
  const dashboard = useDashboard();
  const list = useAdminApartments(useDebouncedValue(search.trim(), 300), status);
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  const stats: { key: ApartmentStatus | null; label: string; value: number | undefined }[] = [
    { key: null, label: t('admin.stats.total'), value: dashboard.data?.total },
    ...STATUSES.map((s) => ({ key: s, label: t(`admin.status.${s}`), value: dashboard.data?.[s] })),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-3 pt-3 pb-[calc(2rem+var(--safe-bottom))]">
      <section aria-label={t('admin.title')} className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            aria-pressed={status === stat.key}
            onClick={() => {
              setStatus(stat.key);
            }}
            className={`rounded-2xl p-3 text-left ${
              status === stat.key ? 'bg-accent text-accent-fg' : 'bg-surface'
            }`}
          >
            <span className="block text-2xl font-bold">{stat.value ?? '–'}</span>
            <span className="text-xs">{stat.label}</span>
          </button>
        ))}
      </section>

      <Link
        to="/admin/apartments/new"
        className="bg-accent text-accent-fg flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold"
      >
        <PlusIcon />
        {t('admin.addApartment')}
      </Link>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('admin.manage')}</h2>
        <label className="border-hint/30 bg-bg flex items-center gap-2 rounded-xl border px-3">
          <SearchIcon className="text-hint" />
          <span className="sr-only">{t('admin.search')}</span>
          <input
            type="search"
            value={search}
            placeholder={t('admin.search')}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            className="min-h-11 flex-1 bg-transparent outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Chip
            selected={status === null}
            onClick={() => {
              setStatus(null);
            }}
          >
            {t('admin.status.all')}
          </Chip>
          {STATUSES.map((s) => (
            <Chip
              key={s}
              selected={status === s}
              onClick={() => {
                setStatus(s);
              }}
            >
              {t(`admin.status.${s}`)}
            </Chip>
          ))}
        </div>

        {list.isPending ? (
          <div className="text-hint flex justify-center py-10">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <p className="text-hint py-10 text-center">
            {search || status ? t('admin.noResults') : t('admin.empty')}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <ListingCard key={item.id} item={item} />
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <button
            type="button"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
            className="bg-surface text-accent min-h-11 w-full rounded-xl font-medium"
          >
            {t('admin.loadMore')}
          </button>
        )}
      </section>
    </div>
  );
}
