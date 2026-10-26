import type { TFunction } from 'i18next';

import type { District } from '@/api/types';
import type { CatalogFilters } from '@/features/filters/filters';
import { districtName, formatPriceCompact } from '@/lib/format';

/** Short texts for filter buttons, or null when the category is not set. */
export function priceSummary(t: TFunction, filters: CatalogFilters, language: string) {
  const price = (value: number) => formatPriceCompact(value, language);
  const { minPrice, maxPrice } = filters;
  if (minPrice !== null && maxPrice !== null) return `${price(minPrice)} – ${price(maxPrice)}`;
  if (minPrice !== null) return t('catalog.rentFrom', { min: price(minPrice) });
  if (maxPrice !== null) return t('catalog.rentUpTo', { max: price(maxPrice) });
  return null;
}

export function bedroomsSummary(t: TFunction, filters: CatalogFilters) {
  if (filters.bedrooms.length === 0) return null;
  return filters.bedrooms
    .map((b) => (b === 0 ? t('apartment.studio') : b === 3 ? t('filters.threePlus') : String(b)))
    .join(', ');
}

export function districtSummary(
  t: TFunction,
  filters: CatalogFilters,
  districts: District[] | undefined,
  language: string,
) {
  const names = filters.districts
    .map((id) => districts?.find((d) => d.id === id))
    .filter((d): d is District => d !== undefined)
    .map((d) => districtName(d, language));
  if (names.length === 0) return null;
  if (names.length === 1) return names[0] ?? null;
  return t('catalog.districtsMore', { first: names[0], count: names.length - 1 });
}

export function areaSummary(filters: CatalogFilters) {
  const { minArea, maxArea } = filters;
  if (minArea === null && maxArea === null) return null;
  if (minArea !== null && maxArea !== null) return `${minArea}–${maxArea} m²`;
  return minArea !== null ? `≥ ${minArea} m²` : `≤ ${maxArea ?? 0} m²`;
}
