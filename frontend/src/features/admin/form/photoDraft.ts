import type { Image } from '@/api/types';

/**
 * Photos as edited in the form: already saved ones and newly picked files. Changes are
 * applied only when the form is saved, like every other field.
 */
export type PhotoItem =
  | { kind: 'saved'; key: string; image: Image }
  | { kind: 'new'; key: string; file: File; src: string };

export function fromImages(images: Image[]): PhotoItem[] {
  return images.map((image) => ({ kind: 'saved', key: image.id, image }));
}

export function photosChanged(items: PhotoItem[], images: Image[]): boolean {
  return (
    items.length !== images.length ||
    items.some((item, index) => item.kind !== 'saved' || item.image.id !== images[index]?.id)
  );
}

export function releasePreviews(items: PhotoItem[]): void {
  for (const item of items) if (item.kind === 'new') URL.revokeObjectURL(item.src);
}
