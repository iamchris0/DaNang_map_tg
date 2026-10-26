import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { uploadImage, useImageMutations } from '@/api/admin';
import type { Image } from '@/api/types';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/toastContext';

import { adminErrorMessage } from '../errors';
import { MAX_PHOTOS, rejectionText, type RejectReason, screenFiles } from './photoRules';
import { PhotoTiles, type Tile } from './PhotoTiles';

function useRejectToast() {
  const { t } = useTranslation();
  const toast = useToast();
  return (name: string, reason: RejectReason) => {
    toast(t('admin.photos.rejected', { name, reason: rejectionText(t, reason) }), 'error');
  };
}

/** Photos of a saved listing: changes apply immediately via the API. */
export function PhotoManager({ apartmentId, images }: { apartmentId: string; images: Image[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const reject = useRejectToast();
  const { reorder, remove, refresh } = useImageMutations(apartmentId);
  const [uploads, setUploads] = useState<Tile[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    const ids = images.map((image) => image.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    reorder.mutate(ids, {
      onError: (error) => {
        toast(adminErrorMessage(t, error), 'error');
      },
    });
  };

  const add = async (files: File[]) => {
    const accepted = screenFiles(files, MAX_PHOTOS - images.length - uploads.length, reject);
    const queued = accepted.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      src: URL.createObjectURL(file),
      progress: 0,
    }));
    setUploads((current) => [...current, ...queued]);
    let uploaded = 0;
    // Sequential uploads keep the order and give clear per-file progress on mobile data.
    for (const [index, file] of accepted.entries()) {
      const tile = queued[index];
      try {
        await uploadImage(apartmentId, file, (fraction) => {
          setUploads((current) =>
            current.map((u) => (u.key === tile?.key ? { ...u, progress: fraction } : u)),
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
        if (tile) URL.revokeObjectURL(tile.src);
        setUploads((current) => current.filter((u) => u.key !== tile?.key));
      }
    }
    if (uploaded > 0) toast(t('admin.photos.uploaded', { count: uploaded }));
  };

  const tiles: Tile[] = [
    ...images.map((image) => ({ key: image.id, src: image.thumb_url })),
    ...uploads,
  ];

  return (
    <>
      <PhotoTiles
        tiles={tiles}
        busy={reorder.isPending}
        onMove={(from, to) => {
          if (from < images.length && to < images.length) move(from, to);
        }}
        onRemove={(index) => {
          const image = images[index];
          if (image) setConfirmRemove(image.id);
        }}
        onAdd={(files) => void add(files)}
      />
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
    </>
  );
}

export interface StagedPhoto {
  key: string;
  file: File;
  src: string;
}

/** Photos chosen for a listing that doesn't exist yet; uploaded right after it's created. */
export function StagedPhotoManager({
  photos,
  onChange,
  progress,
}: {
  photos: StagedPhoto[];
  onChange: (photos: StagedPhoto[]) => void;
  progress: Record<string, number>;
}) {
  const reject = useRejectToast();
  return (
    <PhotoTiles
      tiles={photos.map((photo) => ({
        key: photo.key,
        src: photo.src,
        ...(photo.key in progress ? { progress: progress[photo.key] } : {}),
      }))}
      busy={Object.keys(progress).length > 0}
      onMove={(from, to) => {
        const next = [...photos];
        const [moved] = next.splice(from, 1);
        if (!moved) return;
        next.splice(to, 0, moved);
        onChange(next);
      }}
      onRemove={(index) => {
        const removed = photos[index];
        if (removed) URL.revokeObjectURL(removed.src);
        onChange(photos.filter((_, i) => i !== index));
      }}
      onAdd={(files) => {
        const accepted = screenFiles(files, MAX_PHOTOS - photos.length, reject);
        onChange([
          ...photos,
          ...accepted.map((file, index) => ({
            key: `${Date.now()}-${index}-${file.name}`,
            file,
            src: URL.createObjectURL(file),
          })),
        ]);
      }}
    />
  );
}
