import type { TFunction } from 'i18next';

import type { District } from '@/api/types';
import type { CatalogFilters } from '@/features/filters/filters';
import { districtName, formatPriceCompact } from '@/lib/format';

export interface FilterSummary {
  where: string;
  rent: string;
  size: string;
}

/** Short texts for the search pill, e.g. "Sơn Trà +1", "8M–15M ₫", "Studio, 2". */
export function summarize(
  t: TFunction,
  filters: CatalogFilters,
  districts: District[] | undefined,
  language: string,
): FilterSummary {
  const names = filters.districts
    .map((id) => districts?.find((d) => d.id === id))
    .filter((d): d is District => d !== undefined)
    .map((d) => districtName(d, language));
  const where =
    names.length === 0
      ? t('catalog.anywhere')
      : names.length === 1
        ? (names[0] ?? '')
        : t('catalog.districtsMore', { first: names[0], count: names.length - 1 });

  const price = (value: number) => formatPriceCompact(value, language);
  const { minPrice, maxPrice } = filters;
  const rent =
    minPrice !== null && maxPrice !== null
      ? `${price(minPrice)} – ${price(maxPrice)}`
      : minPrice !== null
        ? t('catalog.rentFrom', { min: price(minPrice) })
        : maxPrice !== null
          ? t('catalog.rentUpTo', { max: price(maxPrice) })
          : t('catalog.anyRent');

  const rooms = filters.bedrooms.map((b) =>
    b === 0 ? t('apartment.studio') : b === 3 ? t('filters.threePlus') : String(b),
  );
  const area =
    filters.minArea !== null || filters.maxArea !== null
      ? `${filters.minArea ?? 0}–${filters.maxArea ?? '∞'} m²`
      : null;
  const size = [rooms.join(', '), area].filter(Boolean).join(' · ') || t('catalog.anySize');
  return { where, rent, size };
}
