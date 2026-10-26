import type { TFunction } from 'i18next';

const ERROR_CODES = [
  'bot_not_admin',
  'missing_permission',
  'chat_not_found',
  'media_rejected',
  'media_unavailable',
  'caption_too_long',
  'rate_limited',
  'telegram_unavailable',
  'bot_token_invalid',
  'telegram_rejected',
  'unconfirmed',
  'not_published',
] as const;
type ErrorCode = (typeof ERROR_CODES)[number];

function isErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code);
}

/** Translated explanation for a stored publication error code. */
export function publicationErrorText(t: TFunction, code: string | null): string {
  return code && isErrorCode(code)
    ? t(`admin.telegram.errors.${code}`)
    : t('admin.telegram.errors.telegram_rejected');
}
