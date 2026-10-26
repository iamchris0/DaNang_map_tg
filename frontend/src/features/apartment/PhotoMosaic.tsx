import { useTranslation } from 'react-i18next';

import type { Image } from '@/api/types';
import { GridIcon } from '@/components/ui/icons';

import { ApartmentPhoto } from './ApartmentPhoto';

interface Props {
  images: Image[];
  title: string;
  /** Open the full-screen viewer at this photo. */
  onOpen: (index: number) => void;
}

/** Desktop photo layout: one large photo with up to four smaller ones beside it. */
export function PhotoMosaic({ images, title, onOpen }: Props) {
  const { t } = useTranslation();
  const [first, ...rest] = images;
  const side = rest.slice(0, 4);
  if (!first) {
    return <ApartmentPhoto image={null} alt={title} className="h-[26rem] w-full rounded-2xl" />;
  }
  const total = images.length;
  const tile = (image: Image, index: number, className: string, sizes: string) => (
    <button
      key={image.id}
      type="button"
      onClick={() => {
        onOpen(index);
      }}
      aria-label={t('apartment.openPhoto', { index: index + 1, total })}
      className={`group h-full w-full overflow-hidden ${className}`}
    >
      <ApartmentPhoto
        image={image}
        alt={index === 0 ? title : `${title} ${index + 1}`}
        eager={index === 0}
        sizes={sizes}
        className="h-full w-full transition duration-300 group-hover:brightness-90"
      />
    </button>
  );
  return (
    <div className="relative">
      <div
        className={`grid h-[26rem] gap-2 overflow-hidden rounded-2xl ${
          side.length === 0
            ? 'grid-cols-1'
            : side.length === 1
              ? 'grid-cols-2'
              : 'grid-cols-4 grid-rows-2'
        }`}
      >
        {tile(first, 0, side.length > 1 ? 'col-span-2 row-span-2' : '', '50vw')}
        {side.map((image, index) =>
          tile(
            image,
            index + 1,
            `${side.length === 2 ? 'col-span-2' : ''} ${
              side.length === 3 && index === 2 ? 'col-span-2' : ''
            }`,
            '25vw',
          ),
        )}
      </div>
      {total > 1 && (
        <button
          type="button"
          onClick={() => {
            onOpen(0);
          }}
          className="border-fg/80 bg-bg text-fg shadow-card hover:bg-surface absolute right-4 bottom-4 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold"
        >
          <GridIcon width={16} height={16} />
          {t('apartment.showAllPhotos', { count: total })}
        </button>
      )}
    </div>
  );
}
