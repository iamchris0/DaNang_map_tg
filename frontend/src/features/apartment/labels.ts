import type { TFunction } from 'i18next';

export function roomsLabel(t: TFunction, bedrooms: number): string {
  return bedrooms === 0 ? t('apartment.studio') : t('apartment.bedrooms', { count: bedrooms });
}
