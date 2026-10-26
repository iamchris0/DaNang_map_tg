import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Image } from '@/api/types';

import { ApartmentPhoto } from './ApartmentPhoto';

interface Props {
  images: Image[];
  title: string;
  /** Open the full-screen viewer at this photo. */
  onOpen: (index: number) => void;
}

/** Swipeable, scroll-snapping photo gallery; tap a photo to view it full screen. */
export function Gallery({ images, title, onOpen }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return <ApartmentPhoto image={null} alt={title} className="aspect-[4/3] w-full" />;
  }

  return (
    <div className="relative">
      <ul
        className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
        onScroll={(event) => {
          const { scrollLeft, clientWidth } = event.currentTarget;
          setIndex(Math.round(scrollLeft / Math.max(clientWidth, 1)));
        }}
      >
        {images.map((image, i) => (
          <li key={image.id} className="w-full shrink-0 snap-center">
            <button
              type="button"
              onClick={() => {
                onOpen(i);
              }}
              aria-label={t('apartment.openPhoto', { index: i + 1, total: images.length })}
              className="block h-full w-full"
            >
              <ApartmentPhoto
                image={image}
                alt={t('apartment.photoCount', { index: i + 1, total: images.length })}
                className="h-full w-full"
                eager={i === 0}
              />
            </button>
          </li>
        ))}
      </ul>
      {images.length > 1 && (
        <span
          aria-hidden="true"
          className="absolute right-4 bottom-4 rounded-md bg-black/70 px-2.5 py-1 text-xs font-semibold text-white"
        >
          {index + 1} / {images.length}
        </span>
      )}
    </div>
  );
}
