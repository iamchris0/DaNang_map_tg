import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Image } from '@/api/types';
import { ImageIcon } from '@/components/ui/icons';

interface Props {
  image: Image | null;
  alt: string;
  className?: string;
  eager?: boolean;
}

/** Cover-cropped photo with intrinsic size hints and a graceful placeholder. */
export function ApartmentPhoto({ image, alt, className = '', eager = false }: Props) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  if (!image || failed) {
    return (
      <div
        role="img"
        aria-label={t('apartment.noPhoto')}
        className={`bg-surface text-hint flex items-center justify-center ${className}`}
      >
        <ImageIcon width={32} height={32} />
      </div>
    );
  }
  return (
    <img
      src={image.url}
      alt={alt}
      width={image.width}
      height={image.height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => {
        setFailed(true);
      }}
      className={`bg-surface object-cover ${className}`}
    />
  );
}
