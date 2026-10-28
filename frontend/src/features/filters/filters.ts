import type { QueryValue } from '@/api/client';
import { sortAmenities } from '@/features/amenities/catalog';

/** Catalog filters. Prices are integer VND; `bedrooms` uses 0 = studio and 3 = "3+". */
export interface CatalogFilters {
  minPrice: number | null;
  maxPrice: number | null;
  bedrooms: number[];
  districts: number[];
  minArea: number | null;
  maxArea: number | null;
  /** Amenity keys; listings must have all of them. */
  amenities: string[];
}

export const EMPTY_FILTERS: CatalogFilters = {
  minPrice: null,
  maxPrice: null,
  bedrooms: [],
  districts: [],
  minArea: null,
  maxArea: null,
  amenities: [],
};

export const BEDROOM_OPTIONS = [0, 1, 2, 3] as const;

// URL keys deliberately match the API query parameters.
const KEYS = {
  minPrice: 'min_price',
  maxPrice: 'max_price',
  bedrooms: 'bedrooms',
  districts: 'district',
  minArea: 'min_area',
  maxArea: 'max_area',
  amenities: 'amenities',
} as const;

function parseNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function parseIntList(raw: string | null, valid: (value: number) => boolean): number[] {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map(Number)
    .filter((value) => Number.isInteger(value) && valid(value));
  return [...new Set(values)].sort((a, b) => a - b);
}

export function parseFilters(params: URLSearchParams): CatalogFilters {
  return {
    minPrice: parseNumber(params.get(KEYS.minPrice)),
    maxPrice: parseNumber(params.get(KEYS.maxPrice)),
    bedrooms: parseIntList(params.get(KEYS.bedrooms), (v) => v >= 0 && v <= 3),
    districts: parseIntList(params.get(KEYS.districts), (v) => v > 0),
    minArea: parseNumber(params.get(KEYS.minArea)),
    maxArea: parseNumber(params.get(KEYS.maxArea)),
    amenities: sortAmenities((params.get(KEYS.amenities) ?? '').split(',')),
  };
}

export function writeFilters(params: URLSearchParams, filters: CatalogFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: number | null | number[] | string[]) => {
    const text = Array.isArray(value) ? value.join(',') : value === null ? '' : String(value);
    if (text) next.set(key, text);
    else next.delete(key);
  };
  set(KEYS.minPrice, filters.minPrice);
  set(KEYS.maxPrice, filters.maxPrice);
  set(KEYS.bedrooms, filters.bedrooms);
  set(KEYS.districts, filters.districts);
  set(KEYS.minArea, filters.minArea);
  set(KEYS.maxArea, filters.maxArea);
  set(KEYS.amenities, filters.amenities);
  return next;
}

export function filtersToQuery(filters: CatalogFilters): Record<string, QueryValue> {
  return {
    min_price: filters.minPrice,
    max_price: filters.maxPrice,
    bedrooms: filters.bedrooms,
    district: filters.districts,
    min_area: filters.minArea,
    max_area: filters.maxArea,
    amenities: filters.amenities,
  };
}

export function activeFilterCount(filters: CatalogFilters): number {
  return [
    filters.minPrice !== null || filters.maxPrice !== null,
    filters.bedrooms.length > 0,
    filters.districts.length > 0,
    filters.minArea !== null || filters.maxArea !== null,
    filters.amenities.length > 0,
  ].filter(Boolean).length;
}
