import { z } from 'zod';

import type { AdminApartment, ApartmentInput, ContactType } from '@/api/types';
import { CUSTOM_AMENITY_MAX_LENGTH, MAX_CUSTOM_AMENITIES } from '@/features/amenities/catalog';

/**
 * Form model. Inputs are kept as strings while editing; `toInput` converts them to the API
 * payload. Every field is optional so drafts can be saved; the backend decides what is
 * required for publishing (shown as `missing_fields`). Messages are i18n keys.
 */
const MAX_VND = 100_000_000_000;

const text = (max: number) => z.string().trim().max(max, 'validation.tooLong');

const wholeNumber = (min: number, max: number, minMessage = 'validation.range') =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+$/.test(v), 'validation.integer')
    .refine((v) => v === '' || Number(v) >= min, minMessage)
    .refine((v) => v === '' || Number(v) <= max, 'validation.range');

const USERNAME_RE = /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/;
const TELEGRAM_LINK_RE =
  /^(?:(?:https?:\/\/)?(?:t\.me|telegram\.me)\/\+?[A-Za-z0-9_]+\/?|tg:\/\/resolve\?domain=[A-Za-z0-9_]+)$/i;

function validContact(type: ContactType, value: string): string | null {
  switch (type) {
    case 'telegram_username':
      return USERNAME_RE.test(value) ? null : 'validation.username';
    case 'telegram_link':
      return TELEGRAM_LINK_RE.test(value) ? null : 'validation.telegramLink';
    case 'phone': {
      const digits = value.replace(/[\s().+-]/g, '');
      return /^\d{8,15}$/.test(digits) ? null : 'validation.phone';
    }
  }
}

export const apartmentSchema = z
  .object({
    title: text(200),
    description: text(5000),
    price: wholeNumber(1, MAX_VND, 'validation.positive'),
    area: z
      .string()
      .trim()
      .refine((v) => v === '' || /^\d+([.,]\d)?$/.test(v), 'validation.oneDecimal')
      .refine((v) => v === '' || Number(v.replace(',', '.')) > 0, 'validation.positive')
      .refine((v) => v === '' || Number(v.replace(',', '.')) <= 10_000, 'validation.range'),
    bedrooms: wholeNumber(0, 20),
    bathrooms: wholeNumber(0, 20),
    district_id: z.string(),
    address: text(500),
    location: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
    location_precision: z.enum(['', 'exact', 'approximate']),
    // The deposit is a fixed amount or a number of months' rent.
    deposit_mode: z.enum(['amount', 'months']),
    deposit: wholeNumber(0, MAX_VND),
    deposit_months: wholeNumber(1, 12),
    minimum_rental_months: wholeNumber(1, 120),
    rental_conditions: text(5000),
    amenities: z.array(z.string()),
    custom_amenities: z
      .array(z.string().trim().max(CUSTOM_AMENITY_MAX_LENGTH, 'validation.tooLong'))
      .max(MAX_CUSTOM_AMENITIES, 'validation.range'),
    agent_contact_type: z.enum(['', 'telegram_username', 'telegram_link', 'phone']),
    agent_contact_value: text(256),
  })
  .superRefine((values, ctx) => {
    const type = values.agent_contact_type;
    const value = values.agent_contact_value;
    if (type && !value) {
      ctx.addIssue({
        code: 'custom',
        path: ['agent_contact_value'],
        message: 'validation.required',
      });
    } else if (!type && value) {
      ctx.addIssue({
        code: 'custom',
        path: ['agent_contact_type'],
        message: 'validation.required',
      });
    } else if (type && value) {
      const problem = validContact(type, value);
      if (problem)
        ctx.addIssue({ code: 'custom', path: ['agent_contact_value'], message: problem });
    }
  });

export type ApartmentFormValues = z.infer<typeof apartmentSchema>;

export const EMPTY_VALUES: ApartmentFormValues = {
  title: '',
  description: '',
  price: '',
  area: '',
  bedrooms: '',
  bathrooms: '',
  district_id: '',
  address: '',
  location: null,
  location_precision: '',
  deposit_mode: 'amount',
  deposit: '',
  deposit_months: '',
  minimum_rental_months: '',
  rental_conditions: '',
  amenities: [],
  custom_amenities: [],
  agent_contact_type: '',
  agent_contact_value: '',
};

const str = (value: number | string | null) => (value === null ? '' : String(value));
const orNull = (value: string) => (value.trim() === '' ? null : value.trim());
const intOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

export function fromApartment(apartment: AdminApartment): ApartmentFormValues {
  return {
    title: apartment.title ?? '',
    description: apartment.description ?? '',
    price: str(apartment.price_vnd),
    area: apartment.area_sqm === null ? '' : String(Number(apartment.area_sqm)),
    bedrooms: str(apartment.bedrooms),
    bathrooms: str(apartment.bathrooms),
    district_id: str(apartment.district?.id ?? null),
    address: apartment.address ?? '',
    location:
      apartment.latitude !== null && apartment.longitude !== null
        ? { latitude: apartment.latitude, longitude: apartment.longitude }
        : null,
    location_precision: apartment.location_precision ?? '',
    deposit_mode: apartment.deposit_months !== null ? 'months' : 'amount',
    deposit: str(apartment.deposit_vnd),
    deposit_months: str(apartment.deposit_months),
    minimum_rental_months: str(apartment.minimum_rental_months),
    rental_conditions: apartment.rental_conditions ?? '',
    amenities: [...apartment.amenities],
    custom_amenities: [...apartment.custom_amenities],
    agent_contact_type: apartment.agent_contact_type ?? '',
    agent_contact_value: apartment.agent_contact_value ?? '',
  };
}

export function toInput(values: ApartmentFormValues): ApartmentInput {
  const area = orNull(values.area);
  return {
    title: orNull(values.title),
    description: orNull(values.description),
    price_vnd: intOrNull(values.price),
    area_sqm: area === null ? null : area.replace(',', '.'),
    bedrooms: intOrNull(values.bedrooms),
    bathrooms: intOrNull(values.bathrooms),
    district_id: intOrNull(values.district_id),
    address: orNull(values.address),
    latitude: values.location?.latitude ?? null,
    longitude: values.location?.longitude ?? null,
    location_precision: values.location_precision || null,
    deposit_vnd: values.deposit_mode === 'amount' ? intOrNull(values.deposit) : null,
    deposit_months: values.deposit_mode === 'months' ? intOrNull(values.deposit_months) : null,
    minimum_rental_months: intOrNull(values.minimum_rental_months),
    rental_conditions: orNull(values.rental_conditions),
    amenities: values.amenities,
    custom_amenities: values.custom_amenities,
    agent_contact_type: values.agent_contact_type || null,
    agent_contact_value: values.agent_contact_type ? orNull(values.agent_contact_value) : null,
  };
}

/** API field name (from a 422 `loc`) -> form field name. */
export const SERVER_FIELD_MAP: Record<string, keyof ApartmentFormValues> = {
  title: 'title',
  description: 'description',
  price_vnd: 'price',
  area_sqm: 'area',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  district_id: 'district_id',
  address: 'address',
  latitude: 'location',
  longitude: 'location',
  location_precision: 'location_precision',
  deposit_vnd: 'deposit',
  deposit_months: 'deposit_months',
  minimum_rental_months: 'minimum_rental_months',
  rental_conditions: 'rental_conditions',
  amenities: 'amenities',
  custom_amenities: 'custom_amenities',
  agent_contact_type: 'agent_contact_type',
  agent_contact_value: 'agent_contact_value',
};
