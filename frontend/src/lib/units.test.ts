import {
  activeFilterCount,
  EMPTY_FILTERS,
  parseFilters,
  writeFilters,
} from '@/features/filters/filters';
import { resolveInitialLanguage } from '@/i18n';

import { formatPriceCompact, formatPriceFull } from './format';

describe('price formatting', () => {
  it.each([
    [8_500_000, 'en', '8.5M ₫'],
    [12_000_000, 'en', '12M ₫'],
    [45_000_000, 'en', '45M ₫'],
    [8_500_000, 'ru', '8,5 млн ₫'],
  ])('compact %s (%s) → %s', (vnd, lang, expected) => {
    expect(formatPriceCompact(vnd, lang).replace(/\s/g, ' ')).toBe(expected);
  });

  it('full prices group thousands', () => {
    expect(formatPriceFull(12_000_000, 'en')).toBe('12,000,000 ₫');
  });
});

describe('filter URL state', () => {
  it('round-trips through the URL', () => {
    const filters = {
      minPrice: 5_000_000,
      maxPrice: 15_000_000,
      bedrooms: [0, 3],
      districts: [2, 1],
      minArea: 30,
      maxArea: null,
    };
    const params = writeFilters(new URLSearchParams('view=list'), filters);
    expect(params.toString()).toBe(
      'view=list&min_price=5000000&max_price=15000000&bedrooms=0%2C3&district=2%2C1&min_area=30',
    );
    expect(parseFilters(params)).toEqual({ ...filters, districts: [1, 2] });
    expect(activeFilterCount(filters)).toBe(4);
  });

  it('ignores malformed values', () => {
    expect(parseFilters(new URLSearchParams('min_price=abc&bedrooms=1,9,x,1&district=-3'))).toEqual(
      { ...EMPTY_FILTERS, bedrooms: [1] },
    );
  });
});

describe('initial language', () => {
  it('uses the choice stored on this device, otherwise English', () => {
    expect(resolveInitialLanguage()).toBe('en');
    localStorage.setItem('dna.language', 'vi');
    expect(resolveInitialLanguage()).toBe('vi');
    localStorage.setItem('dna.language', 'de');
    expect(resolveInitialLanguage()).toBe('en');
  });
});
