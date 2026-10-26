import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { ApartmentCard as ApartmentCardData } from '@/api/types';
import { AreaIcon, BedIcon, PinIcon } from '@/components/ui/icons';
import { districtName, formatArea, formatPriceFull } from '@/lib/format';

import { ApartmentPhoto } from './ApartmentPhoto';
import { roomsLabel } from './labels';

export function ApartmentCard({ apartment }: { apartment: ApartmentCardData }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';

  return (
    <Link
      to={`/apartments/${apartment.id}`}
      className="group bg-surface focus-visible:outline-accent block overflow-hidden rounded-2xl focus-visible:outline-2"
    >
      <div className="relative">
        <ApartmentPhoto
          image={apartment.cover_image}
          alt={apartment.title}
          className="aspect-[4/3] w-full"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        <span className="absolute top-2 left-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
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
}: {
  apartment: ApartmentCardData;
  language: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 p-3">
      <p className="text-lg font-bold">
        {formatPriceFull(apartment.price_vnd, language)}{' '}
        <span className="text-hint text-sm font-normal">{t('apartment.perMonth')}</span>
      </p>
      <h3 className="line-clamp-2 font-medium">{apartment.title}</h3>
      <p className="text-hint flex items-center gap-1 text-sm">
        <PinIcon width={14} height={14} />
        {districtName(apartment.district, language)}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center gap-1">
          <BedIcon width={16} height={16} className="text-hint" />
          {roomsLabel(t, apartment.bedrooms)}
        </span>
        {apartment.area_sqm !== null && (
          <span className="flex items-center gap-1">
            <AreaIcon width={16} height={16} className="text-hint" />
            {formatArea(apartment.area_sqm, language)}
          </span>
        )}
      </p>
    </div>
  );
}
