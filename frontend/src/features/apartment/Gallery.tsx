import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Image } from '@/api/types';

import { ApartmentPhoto } from './ApartmentPhoto';

/** Swipeable, scroll-snapping photo gallery. */
export function Gallery({ images, title }: { images: Image[]; title: string }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <ApartmentPhoto image={null} alt={title} className="aspect-[4/3] w-full md:rounded-2xl" />
    );
  }

  return (
    <div className="relative">
      <ul
        className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto md:rounded-2xl [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' }}
        onScroll={(event) => {
          const { scrollLeft, clientWidth } = event.currentTarget;
          setIndex(Math.round(scrollLeft / Math.max(clientWidth, 1)));
        }}
      >
        {images.map((image, i) => (
          <li key={image.id} className="w-full shrink-0 snap-center">
            <ApartmentPhoto
              image={image}
              alt={t('apartment.photoCount', { index: i + 1, total: images.length })}
              className="h-full w-full"
              eager={i === 0}
            />
          </li>
        ))}
      </ul>
      {images.length > 1 && (
        <span
          aria-hidden="true"
          className="absolute right-3 bottom-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white"
        >
          {index + 1} / {images.length}
        </span>
      )}
    </div>
  );
}
