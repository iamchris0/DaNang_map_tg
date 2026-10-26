import type { TFunction } from 'i18next';

import { ApiError } from '@/api/client';

const KNOWN_CODES = [
  'listing_incomplete',
  'invalid_district',
  'location_out_of_service_area',
  'invalid_status_transition',
  'invalid_image',
  'unsupported_image_type',
  'file_too_large',
  'too_many_images',
  'rate_limited',
  'validation_error',
  'listing_not_found',
  'already_published',
  'listing_not_available',
  'telegram_not_configured',
  'idempotency_key_reused',
  'publication_not_unconfirmed',
] as const;
type KnownCode = (typeof KNOWN_CODES)[number];

function isKnownCode(code: string): code is KnownCode {
  return (KNOWN_CODES as readonly string[]).includes(code);
}

export function missingFieldsLabel(t: TFunction, fields: string[]): string {
  // latitude/longitude both map to "location"; show it once.
  const labels = fields.map((field) => t(`admin.form.fields.${field}`, { defaultValue: field }));
  return [...new Set(labels)].join(', ');
}

/** Translated, user-facing message for an admin API error. */
export function adminErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError && isKnownCode(error.code)) {
    if (error.code === 'listing_incomplete') {
      const details = error.details as { missing_fields?: string[] } | undefined;
      return t('admin.errors.listing_incomplete', {
        fields: missingFieldsLabel(t, details?.missing_fields ?? []),
      });
    }
    const code: KnownCode = error.code;
    return t(`admin.errors.${code}`);
  }
  return t('admin.errors.generic');
}
