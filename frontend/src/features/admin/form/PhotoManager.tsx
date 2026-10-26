import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { uploadImage, useImageMutations } from '@/api/admin';
import type { Image } from '@/api/types';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
} from '@/components/ui/icons';
import { useToast } from '@/components/ui/toastContext';

import { adminErrorMessage } from '../errors';

// Match the backend defaults (IMAGE_MAX_PER_LISTING, IMAGE_MAX_UPLOAD_MB); the backend
// enforces the real limits.
export const MAX_PHOTOS = 15;
export const MAX_UPLOAD_MB = 10;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

interface Upload {
  key: string;
  name: string;
  progress: number;
}

interface Props {
  apartmentId: string;
  images: Image[];
}

export function PhotoManager({ apartmentId, images }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const { reorder, remove, refresh } = useImageMutations(apartmentId);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const move = (index: number, target: number) => {
    const ids = images.map((image) => image.id);
    const [moved] = ids.splice(index, 1);
    if (moved === undefined) return;
    ids.splice(target, 0, moved);
    reorder.mutate(ids, {
      onError: (error) => {
        toast(adminErrorMessage(t, error), 'error');
      },
    });
  };

  const addFiles = async (files: File[]) => {
    const accepted: File[] = [];
    let room = MAX_PHOTOS - images.length - uploads.length;
    for (const file of files) {
      let reason: string | null = null;
      if (!ACCEPTED.includes(file.type)) reason = t('admin.photos.wrongType');
      else if (file.size > MAX_UPLOAD_MB * 1024 * 1024)
        reason = t('admin.photos.tooLarge', { size: MAX_UPLOAD_MB });
      else if (room <= 0) reason = t('admin.photos.tooMany');
      if (reason) toast(t('admin.photos.rejected', { name: file.name, reason }), 'error');
      else {
        accepted.push(file);
        room -= 1;
      }
    }
    const queued = accepted.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      progress: 0,
    }));
    setUploads((current) => [...current, ...queued]);

    let uploaded = 0;
    // Sequential uploads keep the order and give clear per-file progress on mobile data.
    for (const [index, file] of accepted.entries()) {
      const key = queued[index]?.key;
      try {
        await uploadImage(apartmentId, file, (fraction) => {
          setUploads((current) =>
            current.map((upload) =>
              upload.key === key ? { ...upload, progress: fraction } : upload,
            ),
          );
        });
        uploaded += 1;
        refresh();
      } catch (error) {
        toast(
          t('admin.photos.rejected', { name: file.name, reason: adminErrorMessage(t, error) }),
          'error',
        );
      } finally {
        setUploads((current) => current.filter((upload) => upload.key !== key));
      }
    }
    if (uploaded > 0) toast(t('admin.photos.uploaded', { count: uploaded }));
  };

  return (
    <div className="space-y-3">
      <p className="text-hint text-sm">
        {t('admin.photos.hint', { size: MAX_UPLOAD_MB, max: MAX_PHOTOS })} · {images.length}/
        {MAX_PHOTOS}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((image, index) => (
          <li key={image.id} className="bg-bg overflow-hidden rounded-xl">
            <div className="relative">
              <img
                src={image.thumb_url}
                alt={t('admin.photos.photoAlt', { index: index + 1 })}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
              {index === 0 && (
                <span className="bg-accent text-accent-fg absolute top-1.5 left-1.5 rounded-full px-2 py-0.5 text-xs font-semibold">
                  {t('admin.photos.cover')}
                </span>
              )}
            </div>
            <div className="flex justify-between p-1">
              <button
                type="button"
                aria-label={t('admin.photos.moveEarlier')}
                disabled={index === 0 || reorder.isPending}
                onClick={() => {
                  move(index, index - 1);
                }}
                className="flex size-10 items-center justify-center rounded-lg disabled:opacity-30"
              >
                <ArrowLeftIcon width={18} height={18} />
              </button>
              <button
                type="button"
                aria-label={t('admin.photos.makeCover')}
                disabled={index === 0 || reorder.isPending}
                onClick={() => {
                  move(index, 0);
                }}
                className="flex size-10 items-center justify-center rounded-lg disabled:opacity-30"
              >
                <StarIcon width={18} height={18} />
              </button>
              <button
                type="button"
                aria-label={t('admin.photos.moveLater')}
                disabled={index === images.length - 1 || reorder.isPending}
                onClick={() => {
                  move(index, index + 1);
                }}
                className="flex size-10 items-center justify-center rounded-lg disabled:opacity-30"
              >
                <ArrowRightIcon width={18} height={18} />
              </button>
              <button
                type="button"
                aria-label={t('admin.photos.remove')}
                onClick={() => {
                  setConfirmRemove(image.id);
                }}
                className="text-danger flex size-10 items-center justify-center rounded-lg"
              >
                <TrashIcon width={18} height={18} />
              </button>
            </div>
          </li>
        ))}
        {uploads.map((upload) => (
          <li
            key={upload.key}
            className="bg-bg flex aspect-[4/3] flex-col justify-end gap-1 rounded-xl p-2"
          >
            <span className="truncate text-xs">
              {t('admin.photos.uploading', { name: upload.name })}
            </span>
            <progress
              value={upload.progress}
              max={1}
              aria-label={upload.name}
              className="accent-accent h-1.5 w-full"
            />
          </li>
        ))}
      </ul>

      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED.join(',')}
        className="sr-only"
        data-testid="photo-input"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void addFiles(files);
        }}
      />
      <button
        type="button"
        disabled={images.length + uploads.length >= MAX_PHOTOS}
        onClick={() => input.current?.click()}
        className="border-accent/50 text-accent flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed font-semibold disabled:opacity-40"
      >
        <PlusIcon />
        {t('admin.photos.add')}
      </button>

      <ConfirmDialog
        open={confirmRemove !== null}
        title={t('admin.photos.removeTitle')}
        confirmLabel={t('admin.confirm.delete')}
        destructive
        onCancel={() => {
          setConfirmRemove(null);
        }}
        onConfirm={() => {
          const imageId = confirmRemove;
          setConfirmRemove(null);
          if (!imageId) return;
          remove.mutate(imageId, {
            onSuccess: () => {
              toast(t('admin.photos.removed'));
            },
            onError: (error) => {
              toast(adminErrorMessage(t, error), 'error');
            },
          });
        }}
      />
    </div>
  );
}
