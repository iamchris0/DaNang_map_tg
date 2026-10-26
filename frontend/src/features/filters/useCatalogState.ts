import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

import type { CatalogSort } from '@/api/catalog';

import { type CatalogFilters, EMPTY_FILTERS, parseFilters, writeFilters } from './filters';

export type CatalogView = 'map' | 'list';
const SORTS: readonly CatalogSort[] = ['newest', 'price_asc', 'price_desc'];

/** Filters, view and sort live in the URL so map and list share them and links survive reloads. */
export function useCatalogState() {
  const [params, setParams] = useSearchParams();
  const key = params.toString();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => parseFilters(params), [key]);
  const view: CatalogView = params.get('view') === 'list' ? 'list' : 'map';
  const rawSort = params.get('sort');
  const sort: CatalogSort = SORTS.find((s) => s === rawSort) ?? 'newest';

  const update = useCallback(
    (mutate: (next: URLSearchParams) => URLSearchParams) => {
      setParams((prev) => mutate(new URLSearchParams(prev)), { replace: true });
    },
    [setParams],
  );

  const setFilters = useCallback(
    (next: CatalogFilters) => {
      update((prev) => writeFilters(prev, next));
    },
    [update],
  );
  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, [setFilters]);
  const setView = useCallback(
    (next: CatalogView) => {
      update((prev) => {
        if (next === 'map') prev.delete('view');
        else prev.set('view', next);
        return prev;
      });
    },
    [update],
  );
  const setSort = useCallback(
    (next: CatalogSort) => {
      update((prev) => {
        if (next === 'newest') prev.delete('sort');
        else prev.set('sort', next);
        return prev;
      });
    },
    [update],
  );

  return { filters, setFilters, resetFilters, view, setView, sort, setSort };
}
