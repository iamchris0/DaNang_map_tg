/** Mirrors backend/app/schemas. Money is integer VND; area is a decimal string. */

export type LocationPrecision = 'exact' | 'approximate';
export type ContactType = 'telegram_username' | 'telegram_link' | 'phone';
export type Language = 'en' | 'ru';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface District {
  id: number;
  slug: string;
  name_en: string;
  name_ru: string;
}

export interface Image {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface ApartmentCard {
  id: string;
  title: string;
  price_vnd: number;
  district: District;
  area_sqm: string | null;
  bedrooms: number;
  bathrooms: number | null;
  location_precision: LocationPrecision;
  cover_image: Image | null;
  updated_at: string;
}

export interface Contact {
  type: ContactType;
  value: string;
  url: string;
}

export interface ApartmentDetail extends ApartmentCard {
  description: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  deposit_vnd: number | null;
  minimum_rental_months: number | null;
  rental_conditions: string | null;
  images: Image[];
  agent_contact: Contact | null;
  admin_contact: Contact | null;
  share_url: string;
}

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  price_vnd: number;
  bedrooms: number;
  location_precision: LocationPrecision;
}

export interface MapResponse {
  markers: MapMarker[];
  total: number;
  truncated: boolean;
}

export interface User {
  id: string;
  telegram_user_id: number;
  username: string | null;
  display_name: string | null;
  preferred_language: Language | null;
  is_admin: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
  user: User;
  start_param: string | null;
}
