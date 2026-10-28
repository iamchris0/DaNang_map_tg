import catalog from './catalog.json';

/** Amenities by category, in display order. The backend keeps the same list (app/core/amenities.py). */
export const AMENITY_CATEGORIES: readonly { category: string; items: readonly string[] }[] =
  catalog;

export const ALL_AMENITIES: readonly string[] = AMENITY_CATEGORIES.flatMap((group) => group.items);
const ORDER = new Map(ALL_AMENITIES.map((key, index) => [key, index]));

export const MAX_CUSTOM_AMENITIES = 10;
export const CUSTOM_AMENITY_MAX_LENGTH = 40;

export function isAmenity(value: string): boolean {
  return ORDER.has(value);
}

/** Known keys only, without duplicates, in catalog order. */
export function sortAmenities(values: readonly string[]): string[] {
  return [...new Set(values.filter(isAmenity))].sort(
    (a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0),
  );
}

/** Selected amenities grouped by category (empty categories left out). */
export function groupAmenities(values: readonly string[]) {
  const selected = new Set(values);
  return AMENITY_CATEGORIES.map((group) => ({
    category: group.category,
    items: group.items.filter((key) => selected.has(key)),
  })).filter((group) => group.items.length > 0);
}
