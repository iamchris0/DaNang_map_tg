import type { TFunction } from 'i18next';

import type en from '@/i18n/locales/en.json';

type AmenityKey = keyof typeof en.amenities.items;
type CategoryKey = keyof typeof en.amenities.categories;

export function amenityLabel(t: TFunction, key: string): string {
  return t(`amenities.items.${key as AmenityKey}`);
}

export function categoryLabel(t: TFunction, category: string): string {
  return t(`amenities.categories.${category as CategoryKey}`);
}
