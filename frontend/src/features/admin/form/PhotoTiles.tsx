import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { ACCEPTED_TYPES, MAX_PHOTOS, MAX_UPLOAD_MB } from './photoRules';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
} from '@/components/ui/icons';

export interface Tile {
  key: string;
  src: string;
  /** 0..1 while uploading. */
  progress?: number;
}

interface Props {
  tiles: Tile[];
  /** Count against the limit that isn't shown as a tile yet. */
  reserved?: number;
  busy?: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onAdd: (files: File[]) => void;
}

/**
 * Photo grid shared by new (local, not yet uploaded) and existing listings: first photo is
 * the cover; ← ★ → reorder; the "Add photos" tile fills the next grid cell.
 */
export function PhotoTiles({ tiles, reserved = 0, busy = false, onMove, onRemove, onAdd }: Props) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const full = tiles.length + reserved >= MAX_PHOTOS;
  const iconButton =
    'flex h-10 flex-1 items-center justify-center rounded-lg hover:bg-surface disabled:opacity-30';

  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((tile, index) => (
          <li key={tile.key} className="border-line bg-bg overflow-hidden rounded-xl border">
            <div className="relative">
              <img
                src={tile.src}
                alt={t('admin.photos.photoAlt', { index: index + 1 })}
                className="aspect-[4/3] w-full object-cover"
              />
              {index === 0 && (
                <span className="bg-bg/95 shadow-card absolute top-2 left-2 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                  {t('admin.photos.cover')}
                </span>
              )}
              {tile.progress !== undefined && (
                <div className="absolute inset-x-2 bottom-2">
                  <progress value={tile.progress} max={1} className="accent-accent h-1.5 w-full" />
                </div>
              )}
            </div>
            <div className="flex">
              <button
                type="button"
                aria-label={t('admin.photos.moveEarlier')}
                disabled={index === 0 || busy}
                onClick={() => {
                  onMove(index, index - 1);
                }}
                className={iconButton}
              >
                <ArrowLeftIcon width={18} height={18} />
              </button>
              <button
                type="button"
                aria-label={t('admin.photos.makeCover')}
                disabled={index === 0 || busy}
                onClick={() => {
                  onMove(index, 0);
                }}
                className={iconButton}
              >
                <StarIcon width={18} height={18} />
              </button>
              <button
                type="button"
                aria-label={t('admin.photos.moveLater')}
                disabled={index === tiles.length - 1 || busy}
                onClick={() => {
                  onMove(index, index + 1);
                }}
                className={iconButton}
              >
                <ArrowRightIcon width={18} height={18} />
              </button>
              <button
                type="button"
                aria-label={t('admin.photos.remove')}
                disabled={busy}
                onClick={() => {
                  onRemove(index);
                }}
                className={`${iconButton} text-danger`}
              >
                <TrashIcon width={18} height={18} />
              </button>
            </div>
          </li>
        ))}
        {!full && (
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="border-line text-fg hover:border-fg flex aspect-[4/3] h-full min-h-32 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed font-semibold disabled:opacity-40"
            >
              <PlusIcon />
              {t('admin.photos.add')}
            </button>
          </li>
        )}
      </ul>
      <p className="text-hint text-sm">
        {t('admin.photos.hint', { size: MAX_UPLOAD_MB, max: MAX_PHOTOS })} ·{' '}
        {tiles.length + reserved}/{MAX_PHOTOS}
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(',')}
        className="sr-only"
        data-testid="photo-input"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          onAdd(files);
        }}
      />
    </div>
  );
}
