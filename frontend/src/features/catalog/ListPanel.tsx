import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { type CatalogSort, useApartmentList } from '@/api/catalog';
import { Spinner } from '@/components/ui/Spinner';
import { ApartmentCard } from '@/features/apartment/ApartmentCard';
import type { CatalogFilters } from '@/features/filters/filters';
import type { BBox } from '@/lib/geo';

interface Props {
  filters: CatalogFilters;
  /** Limit to the visible map area (desktop split view). */
  bbox?: BBox | null;
  sort: CatalogSort;
  onSortChange: (sort: CatalogSort) => void;
  onReset: () => void;
}

const SORTS: CatalogSort[] = ['newest', 'price_asc', 'price_desc'];

export function ListPanel({ filters, bbox = null, sort, onSortChange, onReset }: Props) {
  const { t } = useTranslation();
  const query = useApartmentList(filters, sort, bbox);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  // Infinite scroll: load the next page when the sentinel approaches the viewport.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 pt-5 pb-[calc(6rem+var(--safe-bottom))] lg:px-10 lg:pb-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p role="status" className="text-lg font-semibold lg:text-xl">
              {total !== undefined &&
                (bbox
                  ? t('catalog.inMapArea', { count: total })
                  : t('catalog.count', { count: total }))}
            </p>
            <p className="text-hint text-sm">{t('catalog.pricesNote')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">{t('catalog.sort.label')}</span>
            <select
              value={sort}
              onChange={(event) => {
                onSortChange(event.target.value as CatalogSort);
              }}
              className="border-line bg-bg min-h-10 rounded-full border px-4 font-semibold"
            >
              {SORTS.map((option) => (
                <option key={option} value={option}>
                  {t(`catalog.sort.${option}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {query.isPending ? (
          <div className="text-hint flex justify-center py-16">
            <Spinner />
          </div>
        ) : query.isError && items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-hint mb-3">{t('catalog.loadError')}</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="text-accent font-medium"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-hint mb-3">{t('catalog.empty')}</p>
            <button type="button" onClick={onReset} className="text-accent font-medium">
              {t('catalog.resetFilters')}
            </button>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 2xl:grid-cols-3">
              {items.map((apartment) => (
                <li key={apartment.id}>
                  <ApartmentCard apartment={apartment} />
                </li>
              ))}
            </ul>
            <div ref={sentinel} className="text-hint flex justify-center py-6 text-sm">
              {isFetchingNextPage ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  {t('catalog.loadingMore')}
                </span>
              ) : hasNextPage ? (
                <button
                  type="button"
                  onClick={() => void fetchNextPage()}
                  className="text-accent font-medium"
                >
                  {t('catalog.loadingMore')}
                </button>
              ) : (
                t('catalog.endOfList')
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
