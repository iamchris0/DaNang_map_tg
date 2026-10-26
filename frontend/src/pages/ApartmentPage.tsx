import { lazy, type ReactNode, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { useApartment } from '@/api/catalog';
import { ApiError } from '@/api/client';
import { BackIcon, PinIcon, ShareIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { ContactBar } from '@/features/apartment/ContactBar';
import { Gallery } from '@/features/apartment/Gallery';
import { roomsLabel } from '@/features/apartment/labels';
import { districtName, formatArea, formatDate, formatPriceFull } from '@/lib/format';
import { bindBackButton, isInTelegram, shareLink } from '@/telegram/webapp';

const LocationMap = lazy(() => import('@/features/map/LocationMap'));

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-surface rounded-xl p-3">
      <dt className="text-hint text-xs">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function ApartmentPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const { data, error, isPending, refetch } = useApartment(id);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Opened directly (deep link / refresh): "back" goes to the catalog instead of leaving.
  const goBack = useCallback(() => {
    if (location.key === 'default') void navigate('/', { replace: true });
    else void navigate(-1);
  }, [location.key, navigate]);
  useEffect(() => bindBackButton(goBack), [goBack]);

  const header = (
    <div className="bg-bg/95 sticky top-0 z-10 flex items-center gap-2 px-2 pt-[calc(0.25rem+var(--safe-top))] pb-1 backdrop-blur">
      {!isInTelegram() && (
        <button
          type="button"
          onClick={goBack}
          aria-label={t('common.back')}
          className="flex size-10 items-center justify-center rounded-full"
        >
          <BackIcon />
        </button>
      )}
      {data && (
        <button
          type="button"
          onClick={() => {
            void shareLink(data.share_url, data.title).then((result) => {
              setShareStatus(
                result === 'copied'
                  ? t('apartment.linkCopied')
                  : result === 'failed'
                    ? t('apartment.shareFailed')
                    : null,
              );
            });
          }}
          className="text-accent ml-auto flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium"
        >
          <ShareIcon width={18} height={18} />
          {t('apartment.share')}
        </button>
      )}
    </div>
  );

  if (isPending) {
    return (
      <div className="h-full">
        {header}
        <div className="text-hint flex justify-center py-24">
          <Spinner />
        </div>
      </div>
    );
  }

  if (error) {
    const code = error instanceof ApiError ? error.code : null;
    const message =
      code === 'listing_unavailable'
        ? t('apartment.unavailable')
        : code === 'listing_not_found' || (error instanceof ApiError && error.status === 422)
          ? t('apartment.notFound')
          : t('apartment.loadError');
    const retryable = !(error instanceof ApiError) || error.status >= 500;
    return (
      <div className="h-full">
        {header}
        <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
          <p role="alert" className="text-lg">
            {message}
          </p>
          {retryable && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-accent font-medium"
            >
              {t('common.retry')}
            </button>
          )}
          <Link to="/" className="bg-accent text-accent-fg rounded-xl px-5 py-3 font-semibold">
            {t('apartment.browse')}
          </Link>
        </div>
      </div>
    );
  }

  const apartment = data;
  return (
    <div className="h-full overflow-y-auto">
      {header}
      <article className="mx-auto max-w-3xl pb-40 md:px-4">
        <Gallery images={apartment.images} title={apartment.title} />
        <div className="space-y-6 px-4 pt-4">
          <header className="space-y-1">
            <p className="text-2xl font-bold">
              {formatPriceFull(apartment.price_vnd, language)}{' '}
              <span className="text-hint text-base font-normal">{t('apartment.perMonth')}</span>
            </p>
            <h1 className="text-xl font-semibold">{apartment.title}</h1>
            <p className="text-hint flex items-center gap-1">
              <PinIcon width={16} height={16} />
              {districtName(apartment.district, language)}
              {apartment.address && <> · {apartment.address}</>}
            </p>
          </header>

          <Section title={t('apartment.facts')}>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {apartment.area_sqm !== null && (
                <Fact
                  label={t('apartment.area')}
                  value={formatArea(apartment.area_sqm, language)}
                />
              )}
              <Fact
                label={t('apartment.bedroomsLabel')}
                value={roomsLabel(t, apartment.bedrooms)}
              />
              {apartment.bathrooms !== null && (
                <Fact label={t('apartment.bathroomsLabel')} value={apartment.bathrooms} />
              )}
              {apartment.deposit_vnd !== null && (
                <Fact
                  label={t('apartment.deposit')}
                  value={formatPriceFull(apartment.deposit_vnd, language)}
                />
              )}
              {apartment.minimum_rental_months !== null && (
                <Fact
                  label={t('apartment.minimumRental')}
                  value={t('apartment.months', { count: apartment.minimum_rental_months })}
                />
              )}
            </dl>
          </Section>

          {apartment.description && (
            <Section title={t('apartment.description')}>
              <p className="whitespace-pre-line">{apartment.description}</p>
            </Section>
          )}

          {apartment.rental_conditions && (
            <Section title={t('apartment.conditions')}>
              <p className="whitespace-pre-line">{apartment.rental_conditions}</p>
            </Section>
          )}

          <Section title={t('apartment.location')}>
            <Suspense fallback={<div className="bg-surface h-48 rounded-2xl" />}>
              <LocationMap
                latitude={apartment.latitude}
                longitude={apartment.longitude}
                precision={apartment.location_precision}
              />
            </Suspense>
            {apartment.location_precision === 'approximate' && (
              <p className="text-hint text-sm">{t('apartment.approximateLocation')}</p>
            )}
          </Section>

          <p className="text-hint text-sm">
            {t('apartment.updated', { date: formatDate(apartment.updated_at, language) })}
          </p>
          <p aria-live="polite" className="text-accent text-sm">
            {shareStatus}
          </p>
        </div>
      </article>
      <ContactBar agent={apartment.agent_contact} admin={apartment.admin_contact} />
    </div>
  );
}
