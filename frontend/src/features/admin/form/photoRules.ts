import type { TFunction } from 'i18next';

// Match the backend defaults (IMAGE_MAX_PER_LISTING, IMAGE_MAX_UPLOAD_MB); the backend
// enforces the real limits.
export const MAX_PHOTOS = 15;
export const MAX_UPLOAD_MB = 10;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type RejectReason = 'type' | 'size' | 'count';

/** Split files into acceptable ones and translated rejection messages. */
export function screenFiles(
  files: File[],
  room: number,
  reject: (name: string, reason: RejectReason) => void,
): File[] {
  const accepted: File[] = [];
  let left = room;
  for (const file of files) {
    if (!ACCEPTED_TYPES.includes(file.type)) reject(file.name, 'type');
    else if (file.size > MAX_UPLOAD_MB * 1024 * 1024) reject(file.name, 'size');
    else if (left <= 0) reject(file.name, 'count');
    else {
      accepted.push(file);
      left -= 1;
    }
  }
  return accepted;
}

export function rejectionText(t: TFunction, reason: RejectReason): string {
  return reason === 'type'
    ? t('admin.photos.wrongType')
    : reason === 'size'
      ? t('admin.photos.tooLarge', { size: MAX_UPLOAD_MB })
      : t('admin.photos.tooMany');
}
