import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/ui/toastContext';

import type { PhotoItem } from './photoDraft';
import { MAX_PHOTOS, rejectionText, type RejectReason, screenFiles } from './photoRules';
import { PhotoTiles } from './PhotoTiles';

interface Props {
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
  /** Upload progress (0..1) by item key while saving. */
  progress: Record<string, number>;
  busy: boolean;
}

/** Add, reorder (first = cover) and remove photos; nothing is sent until the form is saved. */
export function PhotoEditor({ photos, onChange, progress, busy }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const reject = (name: string, reason: RejectReason) => {
    toast(t('admin.photos.rejected', { name, reason: rejectionText(t, reason) }), 'error');
  };

  return (
    <PhotoTiles
      tiles={photos.map((photo) => ({
        key: photo.key,
        src: photo.kind === 'saved' ? photo.image.thumb_url : photo.src,
        ...(photo.key in progress ? { progress: progress[photo.key] } : {}),
      }))}
      busy={busy}
      onMove={(from, to) => {
        const next = [...photos];
        const [moved] = next.splice(from, 1);
        if (!moved) return;
        next.splice(to, 0, moved);
        onChange(next);
      }}
      onRemove={(index) => {
        const removed = photos[index];
        if (removed?.kind === 'new') URL.revokeObjectURL(removed.src);
        onChange(photos.filter((_, i) => i !== index));
      }}
      onAdd={(files) => {
        const accepted = screenFiles(files, MAX_PHOTOS - photos.length, reject);
        onChange([
          ...photos,
          ...accepted.map((file, index) => ({
            kind: 'new' as const,
            key: `new-${Date.now()}-${index}-${file.name}`,
            file,
            src: URL.createObjectURL(file),
          })),
        ]);
      }}
    />
  );
}
