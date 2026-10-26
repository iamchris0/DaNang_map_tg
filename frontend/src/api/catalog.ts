import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { CatalogFilters } from '@/features/filters/filters';
import { filtersToQuery } from '@/features/filters/filters';
import type { BBox } from '@/lib/geo';

import { ApiError, apiFetch, buildQuery } from './client';
import type { ApartmentCard, ApartmentDetail, District, MapResponse, Page } from './types';

export type CatalogSort = 'newest' | 'price_asc' | 'price_desc';
const PAGE_SIZE = 20;

export function useDistricts() {
  return useQuery({
    queryKey: ['districts'],
    queryFn: () => apiFetch<District[]>('/api/districts'),
    staleTime: 60 * 60 * 1000,
  });
}

export function useMapMarkers(bbox: BBox | null, filters: CatalogFilters) {
  return useQuery({
    queryKey: ['apartments', 'map', bbox, filters],
    queryFn: ({ signal }) =>
      apiFetch<MapResponse>(
        `/api/apartments/map${buildQuery({ ...filtersToQuery(filters), bbox: bbox?.join(',') })}`,
        { signal },
      ),
    enabled: bbox !== null,
    placeholderData: keepPreviousData,
  });
}

export function useApartmentList(filters: CatalogFilters, sort: CatalogSort) {
  return useInfiniteQuery({
    queryKey: ['apartments', 'list', filters, sort],
    queryFn: ({ pageParam, signal }) =>
      apiFetch<Page<ApartmentCard>>(
        `/api/apartments${buildQuery({
          ...filtersToQuery(filters),
          sort,
          page: pageParam,
          page_size: PAGE_SIZE,
        })}`,
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    placeholderData: keepPreviousData,
  });
}

/** Number of listings matching the filters, regardless of the map viewport. */
export function useApartmentCount(filters: CatalogFilters) {
  return useQuery({
    queryKey: ['apartments', 'count', filters],
    queryFn: ({ signal }) =>
      apiFetch<Page<ApartmentCard>>(
        `/api/apartments${buildQuery({ ...filtersToQuery(filters), page_size: 1 })}`,
        { signal },
      ),
    select: (page) => page.total,
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
