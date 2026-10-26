import type { Image } from '@/api/types';

import { ApartmentPhoto } from './ApartmentPhoto';

/** Desktop photo layout: one large photo with up to four smaller ones beside it. */
export function PhotoMosaic({ images, title }: { images: Image[]; title: string }) {
  const [first, ...rest] = images;
  const side = rest.slice(0, 4);
  if (!first) {
    return <ApartmentPhoto image={null} alt={title} className="h-[26rem] w-full rounded-2xl" />;
  }
  return (
    <div
      className={`grid h-[26rem] gap-2 overflow-hidden rounded-2xl ${
        side.length === 0
          ? 'grid-cols-1'
          : side.length === 1
            ? 'grid-cols-2'
            : 'grid-cols-4 grid-rows-2'
      }`}
    >
      <ApartmentPhoto
        image={first}
        alt={title}
        eager
        sizes="50vw"
        className={`h-full w-full ${side.length > 1 ? 'col-span-2 row-span-2' : ''}`}
      />
      {side.map((image, index) => (
        <ApartmentPhoto
          key={image.id}
          image={image}
          alt={`${title} ${index + 2}`}
          sizes="25vw"
          className={`h-full w-full ${side.length === 2 ? 'col-span-2' : ''} ${
            side.length === 3 && index === 2 ? 'col-span-2' : ''
          }`}
        />
      ))}
    </div>
  );
}
