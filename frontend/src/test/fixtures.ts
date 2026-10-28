import type { ApartmentCard, ApartmentDetail, District } from '@/api/types';

export const DISTRICTS: District[] = [
  { id: 1, slug: 'hai-chau', name_en: 'Hải Châu', name_ru: 'Хайчау' },
  { id: 2, slug: 'son-tra', name_en: 'Sơn Trà', name_ru: 'Шонча' },
];

const [haiChau, sonTra] = DISTRICTS as [District, District];

function apartment(overrides: Partial<ApartmentDetail> & { id: string }): ApartmentDetail {
  return {
    title: 'Sea view 1BR',
    price_vnd: 12_000_000,
    district: sonTra,
    area_sqm: '45.0',
    bedrooms: 1,
    bathrooms: 1,
    location_precision: 'exact',
    cover_image: {
      id: `${overrides.id}-img`,
      url: `/img/${overrides.id}.png`,
      thumb_url: `/img/${overrides.id}-sm.png`,
      width: 4,
      height: 3,
    },
    updated_at: '2026-10-20T10:00:00Z',
    description: 'Bright apartment near the beach.',
    address: 'An Thuong 2',
    latitude: 16.0612,
    longitude: 108.2475,
    deposit_vnd: 12_000_000,
    deposit_months: null,
    amenities: ['furnished', 'air_conditioning', 'wifi', 'pool', 'sea_view'],
    custom_amenities: ['Rooftop BBQ'],
    minimum_rental_months: 6,
    rental_conditions: 'No smoking',
    images: [
      {
        id: `${overrides.id}-img`,
        url: `/img/${overrides.id}.png`,
        thumb_url: `/img/${overrides.id}-sm.png`,
        width: 4,
        height: 3,
      },
    ],
    agent_contact: {
      type: 'telegram_username',
      value: 'agent_minh',
      url: 'https://t.me/agent_minh',
    },
    admin_contact: {
      type: 'telegram_username',
      value: 'danang_admin',
      url: 'https://t.me/danang_admin',
    },
    share_url: `https://t.me/DaNangAptBot/app?startapp=${overrides.id}`,
    ...overrides,
  };
}

export const SEA_VIEW = apartment({ id: '11111111-1111-4111-8111-111111111111' });
export const RIVER_2BR = apartment({
  id: '22222222-2222-4222-8222-222222222222',
  title: 'River view 2BR',
  price_vnd: 16_500_000,
  bedrooms: 2,
  district: haiChau,
  latitude: 16.068,
  longitude: 108.224,
  deposit_vnd: null,
  deposit_months: 2,
  amenities: ['furnished', 'air_conditioning', 'wifi', 'river_view'],
  custom_amenities: [],
});
export const STUDIO = apartment({
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Cozy studio',
  price_vnd: 7_500_000,
  bedrooms: 0,
  area_sqm: null,
  bathrooms: null,
  deposit_vnd: null,
  minimum_rental_months: null,
  rental_conditions: null,
  amenities: ['wifi'],
  custom_amenities: [],
  description: null,
  address: null,
  location_precision: 'approximate',
  agent_contact: null,
  latitude: 16.0485,
  longitude: 108.246,
});

export const ALL_APARTMENTS = [SEA_VIEW, RIVER_2BR, STUDIO];

export function toCard(detail: ApartmentDetail): ApartmentCard {
  const {
    id,
    title,
    price_vnd,
    district,
    area_sqm,
    bedrooms,
    bathrooms,
    location_precision,
    cover_image,
    updated_at,
  } = detail;
  return {
    id,
    title,
    price_vnd,
    district,
    area_sqm,
    bedrooms,
    bathrooms,
    location_precision,
    cover_image,
    updated_at,
  };
}
