import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { ApartmentCard as ApartmentCardData } from '@/api/types';
import { districtName, formatArea, formatPriceFull } from '@/lib/format';

import { ApartmentPhoto } from './ApartmentPhoto';
import { roomsLabel } from './labels';

/** Listing card: large rounded photo, then rooms · district, title, details and price. */
export function ApartmentCard({ apartment }: { apartment: ApartmentCardData }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';

  return (
    <Link
      to={`/apartments/${apartment.id}`}
      className="group focus-visible:outline-fg block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <div className="relative overflow-hidden rounded-2xl">
        <ApartmentPhoto
          image={apartment.cover_image}
          alt={apartment.title}
          className="aspect-[20/19] w-full transition-transform duration-300 group-hover:scale-[1.03]"
          sizes="(min-width: 1536px) 22vw, (min-width: 1024px) 28vw, (min-width: 640px) 50vw, 100vw"
        />
        <span className="bg-bg/95 text-fg shadow-card absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-semibold">
          {t('apartment.available')}
        </span>
      </div>
      <ApartmentSummary apartment={apartment} language={language} />
    </Link>
  );
}

export function ApartmentSummary({
  apartment,
  language,
  className = 'mt-3',
}: {
  apartment: ApartmentCardData;
  language: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const details = [
    apartment.area_sqm !== null ? formatArea(apartment.area_sqm, language) : null,
    apartment.bathrooms !== null
      ? t('apartment.bathroomsShort', { count: apartment.bathrooms })
      : null,
  ].filter(Boolean);

  return (
    <div className={`space-y-0.5 text-[15px] leading-snug ${className}`}>
      <p className="truncate font-semibold">
        {roomsLabel(t, apartment.bedrooms)} · {districtName(apartment.district, language)}
      </p>
      <h3 className="text-hint truncate">{apartment.title}</h3>
      {details.length > 0 && <p className="text-hint">{details.join(' · ')}</p>}
      <p className="pt-1">
        <span className="font-semibold">{formatPriceFull(apartment.price_vnd, language)}</span>{' '}
        <span className="text-fg">{t('apartment.perMonth')}</span>
      </p>
    </div>
  );
}
