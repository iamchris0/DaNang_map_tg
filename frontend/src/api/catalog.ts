import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/auth/useAuth';
import type { CatalogFilters } from '@/features/filters/filters';
import { filtersToQuery } from '@/features/filters/filters';
import type { BBox } from '@/lib/geo';

import { ApiError, apiFetch, buildQuery } from './client';
import type { ApartmentCard, ApartmentDetail, District, MapResponse, Page } from './types';

export type CatalogSort = 'newest' | 'price_asc' | 'price_desc';
const PAGE_SIZE = 20;

/**
 * Who is browsing. Landlords see only their own listings, so results are cached per viewer
 * and wait until the Telegram sign-in has settled (no flash of everyone's listings).
 */
function useViewer() {
  const { status, user } = useAuth();
  return { viewer: user?.id ?? null, ready: status !== 'loading' };
}

export function useDistricts() {
  return useQuery({
    queryKey: ['districts'],
    queryFn: () => apiFetch<District[]>('/api/districts'),
    staleTime: 60 * 60 * 1000,
  });
}

export function useMapMarkers(bbox: BBox | null, filters: CatalogFilters) {
  const { viewer, ready } = useViewer();
  return useQuery({
    queryKey: ['apartments', 'map', bbox, filters, viewer],
    queryFn: ({ signal }) =>
      apiFetch<MapResponse>(
        `/api/apartments/map${buildQuery({ ...filtersToQuery(filters), bbox: bbox?.join(',') })}`,
        { signal },
      ),
    enabled: ready && bbox !== null,
    placeholderData: keepPreviousData,
  });
}

/** `bbox` limits results to the visible map area (desktop split view). */
export function useApartmentList(
  filters: CatalogFilters,
  sort: CatalogSort,
  bbox: BBox | null = null,
) {
  const { viewer, ready } = useViewer();
  return useInfiniteQuery({
    queryKey: ['apartments', 'list', filters, sort, bbox, viewer],
    queryFn: ({ pageParam, signal }) =>
      apiFetch<Page<ApartmentCard>>(
        `/api/apartments${buildQuery({
          ...filtersToQuery(filters),
          bbox: bbox?.join(','),
          sort,
          page: pageParam,
          page_size: PAGE_SIZE,
        })}`,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

/** Number of listings matching the filters, regardless of the map viewport. */
export function useApartmentCount(filters: CatalogFilters) {
  const { viewer, ready } = useViewer();
  return useQuery({
    queryKey: ['apartments', 'count', filters, viewer],
    queryFn: ({ signal }) =>
      apiFetch<Page<ApartmentCard>>(
        `/api/apartments${buildQuery({ ...filtersToQuery(filters), page_size: 1 })}`,
        { signal },
      ),
    select: (page) => page.total,
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

export function useApartment(id: string | null) {
  return useQuery({
    queryKey: ['apartments', 'detail', id],
    queryFn: ({ signal }) => apiFetch<ApartmentDetail>(`/api/apartments/${id ?? ''}`, { signal }),
    enabled: id !== null,
    // 404/410 are final answers; don't retry them.
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });
}
