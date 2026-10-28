/** Mirrors backend/app/schemas. Money is integer VND; area is a decimal string. */

export type LocationPrecision = 'exact' | 'approximate';
export type ContactType = 'telegram_username' | 'telegram_link' | 'phone';
export type Language = 'en' | 'ru' | 'vi';

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
  /** Large WebP (max 1600 px). */
  url: string;
  /** Thumbnail WebP (max 480 px). */
  thumb_url: string;
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
  /** Deposit as months of rent; at most one of deposit_vnd / deposit_months is set. */
  deposit_months: number | null;
  minimum_rental_months: number | null;
  rental_conditions: string | null;
  /** Keys from features/amenities/catalog.json. */
  amenities: string[];
  /** The landlord's own additions (free text). */
  custom_amenities: string[];
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
  /** "user" = tenant; landlords manage only their own listings; "admin" manages all. */
  role: 'user' | 'landlord' | 'admin';
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
  user: User;
  start_param: string | null;
}

// --- Admin ---------------------------------------------------------------------------------

export type ApartmentStatus = 'draft' | 'available' | 'rented' | 'archived';
export type PublicationStatus = 'pending' | 'succeeded' | 'failed' | 'unknown';

export interface PublicationSummary {
  status: PublicationStatus;
  telegram_message_id: number | null;
  published_at: string | null;
  created_at: string;
}

export interface AdminApartment {
  id: string;
  status: ApartmentStatus;
  title: string | null;
  description: string | null;
  price_vnd: number | null;
  area_sqm: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  district: District | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  location_precision: LocationPrecision | null;
  deposit_vnd: number | null;
  /** Deposit as months of rent; at most one of deposit_vnd / deposit_months is set. */
  deposit_months: number | null;
  minimum_rental_months: number | null;
  rental_conditions: string | null;
  /** Keys from features/amenities/catalog.json. */
  amenities: string[];
  /** The landlord's own additions (free text). */
  custom_amenities: string[];
  agent_contact_type: ContactType | null;
  agent_contact_value: string | null;
  images: Image[];
  created_at: string;
  updated_at: string;
  missing_fields: string[];
  latest_publication: PublicationSummary | null;
}

/** Editable fields, as sent to POST/PATCH /api/admin/apartments. */
export interface ApartmentInput {
  title: string | null;
  description: string | null;
  price_vnd: number | null;
  area_sqm: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  district_id: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  location_precision: LocationPrecision | null;
  deposit_vnd: number | null;
  /** Deposit as months of rent; at most one of deposit_vnd / deposit_months is set. */
  deposit_months: number | null;
  minimum_rental_months: number | null;
  rental_conditions: string | null;
  /** Keys from features/amenities/catalog.json. */
  amenities: string[];
  /** The landlord's own additions (free text). */
  custom_amenities: string[];
  agent_contact_type: ContactType | null;
  agent_contact_value: string | null;
}

export interface AdminListItem {
  id: string;
  status: ApartmentStatus;
  title: string | null;
  price_vnd: number | null;
  district: District | null;
  cover_image: Image | null;
  updated_at: string;
  publication_status: PublicationStatus | null;
}

export interface Dashboard {
  total: number;
  available: number;
  draft: number;
  rented: number;
  archived: number;
}

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
  kind: string | null;
}

export interface Publication {
  id: string;
  status: PublicationStatus;
  telegram_channel_id: string;
  telegram_message_id: number | null;
  post_url: string | null;
  error_code: string | null;
  error_message: string | null;
  published_by: string | null;
  created_at: string;
  published_at: string | null;
}

export type PublishBlocker =
  'telegram_not_configured' | 'listing_not_available' | 'already_published';

export interface TelegramPreview {
  caption_html: string | null;
  caption_length: number;
  caption_limit: number;
  photo_urls: string[];
  channel_id: string;
  language: string;
  can_publish: boolean;
  blockers: PublishBlocker[];
  live_publication: Publication | null;
}
