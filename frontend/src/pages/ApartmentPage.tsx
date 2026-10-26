import { lazy, type ReactNode, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { useApartment } from '@/api/catalog';
import { ApiError } from '@/api/client';
import type { ApartmentDetail } from '@/api/types';
import {
  AreaIcon,
  BackIcon,
  BathIcon,
  BedIcon,
  CalendarIcon,
  ClockIcon,
  PinIcon,
  ShareIcon,
  WalletIcon,
} from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { ContactActions } from '@/features/apartment/ContactActions';
import { Gallery } from '@/features/apartment/Gallery';
import { roomsLabel } from '@/features/apartment/labels';
import { PhotoMosaic } from '@/features/apartment/PhotoMosaic';
import { PhotoViewer } from '@/features/apartment/PhotoViewer';
import { districtName, formatArea, formatDate, formatPriceFull } from '@/lib/format';
import { DESKTOP_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { bindBackButton, isInTelegram, shareLink } from '@/telegram/webapp';

const LocationMap = lazy(() => import('@/features/map/LocationMap'));

function Fact({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <span className="text-fg flex size-6 shrink-0 items-center justify-center">{icon}</span>
      <dl className="flex flex-1 items-baseline justify-between gap-3">
        <dt className="text-hint">{label}</dt>
        <dd className="text-right font-semibold">{value}</dd>
      </dl>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-line space-y-3 border-t py-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Price({ apartment, language }: { apartment: ApartmentDetail; language: string }) {
  const { t } = useTranslation();
  return (
    <p>
      <span className="text-xl font-semibold">
        {formatPriceFull(apartment.price_vnd, language)}
      </span>{' '}
      <span className="text-hint">{t('apartment.perMonth')}</span>
    </p>
  );
}

export function ApartmentPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { data, error, isPending, refetch } = useApartment(id);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // Opened directly (deep link / refresh): "back" goes to the catalog instead of leaving.
  const goBack = useCallback(() => {
    if (location.key === 'default') void navigate('/', { replace: true });
    else void navigate(-1);
  }, [location.key, navigate]);
  // Full-screen photo viewer; Telegram's back button closes it before leaving the page.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const closeViewer = useCallback(() => {
    setViewerIndex(null);
  }, []);
  const viewerOpen = viewerIndex !== null;
  useEffect(
    () => bindBackButton(viewerOpen ? closeViewer : goBack),
    [viewerOpen, closeViewer, goBack],
  );

  const share = () => {
    if (!data) return;
    void shareLink(data.share_url, data.title).then((result) => {
      setShareStatus(
        result === 'copied'
          ? t('apartment.linkCopied')
          : result === 'failed'
            ? t('apartment.shareFailed')
            : null,
      );
    });
  };

  const roundButton =
    'flex size-10 items-center justify-center rounded-full bg-bg/95 text-fg shadow-card';
  const backButton = !isInTelegram() && (
    <button type="button" onClick={goBack} aria-label={t('common.back')} className={roundButton}>
      <BackIcon />
    </button>
  );

  if (isPending || error) {
    const code = error instanceof ApiError ? error.code : null;
    const message =
      code === 'listing_unavailable'
        ? t('apartment.unavailable')
        : code === 'listing_not_found' || (error instanceof ApiError && error.status === 422)
          ? t('apartment.notFound')
          : t('apartment.loadError');
    const retryable = !(error instanceof ApiError) || error.status >= 500;
    return (
      <div className="h-full overflow-y-auto">
        <div className="px-4 pt-[calc(0.75rem+var(--safe-top))]">{backButton}</div>
        {isPending ? (
          <div className="text-hint flex justify-center py-24">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
            <p role="alert" className="text-lg">
              {message}
            </p>
            {retryable && (
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-semibold underline"
              >
                {t('common.retry')}
              </button>
            )}
            <Link to="/" className="bg-accent text-accent-fg rounded-xl px-5 py-3 font-semibold">
              {t('apartment.browse')}
            </Link>
          </div>
        )}
      </div>
    );
  }

  const apartment = data;
  const district = districtName(apartment.district, language);
  const subtitleDetails = [
    roomsLabel(t, apartment.bedrooms),
    apartment.area_sqm !== null ? formatArea(apartment.area_sqm, language) : null,
    apartment.bathrooms !== null
      ? t('apartment.bathroomsShort', { count: apartment.bathrooms })
      : null,
  ].filter(Boolean);

  const shareButton = (
    <button
      type="button"
      onClick={share}
      className={
        isDesktop
          ? 'hover:bg-surface flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold underline'
          : roundButton
      }
      aria-label={t('apartment.share')}
    >
      <ShareIcon width={18} height={18} />
      {isDesktop && t('apartment.share')}
    </button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto max-w-6xl pb-44 lg:px-10 lg:pt-6 lg:pb-16">
        {isDesktop ? (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                {backButton}
                <h1 className="text-3xl font-semibold">{apartment.title}</h1>
              </div>
              {shareButton}
            </div>
            <PhotoMosaic
              images={apartment.images}
              title={apartment.title}
              onOpen={setViewerIndex}
            />
          </>
        ) : (
          <div className="relative">
            <Gallery images={apartment.images} title={apartment.title} onOpen={setViewerIndex} />
            <div className="absolute inset-x-0 top-0 flex justify-between px-4 pt-[calc(0.75rem+var(--safe-top))]">
              {backButton || <span />}
              {shareButton}
            </div>
          </div>
        )}

        <div className="lg:mt-8 lg:flex lg:gap-16">
          <div className="min-w-0 flex-1 px-4 pt-6 lg:px-0 lg:pt-0">
            <header className="pb-8">
              {!isDesktop && <h1 className="mb-2 text-2xl font-semibold">{apartment.title}</h1>}
              <p className="text-lg font-semibold lg:text-xl">
                {subtitleDetails[0]} · {district}
              </p>
              <p className="text-hint">{subtitleDetails.slice(1).join(' · ')}</p>
              <p className="text-hint mt-1 flex items-center gap-1">
                <PinIcon width={16} height={16} />
                {apartment.address ?? district}
              </p>
            </header>

            <Section title={t('apartment.facts')}>
              <div className="divide-line divide-y">
                {apartment.area_sqm !== null && (
                  <Fact
                    icon={<AreaIcon />}
                    label={t('apartment.area')}
                    value={formatArea(apartment.area_sqm, language)}
                  />
                )}
                <Fact
                  icon={<BedIcon />}
                  label={t('apartment.bedroomsLabel')}
                  value={roomsLabel(t, apartment.bedrooms)}
                />
                {apartment.bathrooms !== null && (
                  <Fact
                    icon={<BathIcon />}
                    label={t('apartment.bathroomsLabel')}
                    value={apartment.bathrooms}
                  />
                )}
                {apartment.deposit_vnd !== null && (
                  <Fact
                    icon={<WalletIcon />}
                    label={t('apartment.deposit')}
                    value={formatPriceFull(apartment.deposit_vnd, language)}
                  />
                )}
                {apartment.minimum_rental_months !== null && (
                  <Fact
                    icon={<CalendarIcon />}
                    label={t('apartment.minimumRental')}
                    value={t('apartment.months', { count: apartment.minimum_rental_months })}
                  />
                )}
              </div>
            </Section>

            {apartment.description && (
              <Section title={t('apartment.description')}>
                <p className="leading-relaxed whitespace-pre-line">{apartment.description}</p>
              </Section>
            )}

            {apartment.rental_conditions && (
              <Section title={t('apartment.conditions')}>
                <p className="leading-relaxed whitespace-pre-line">{apartment.rental_conditions}</p>
              </Section>
            )}

            <Section title={t('apartment.location')}>
              <Suspense fallback={<div className="bg-surface h-64 rounded-2xl" />}>
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

            <p className="border-line text-hint flex items-center gap-2 border-t pt-6 text-sm">
              <ClockIcon width={16} height={16} />
              {t('apartment.updated', { date: formatDate(apartment.updated_at, language) })}
            </p>
            <p aria-live="polite" className="text-sm font-semibold">
              {shareStatus}
            </p>
          </div>

          {isDesktop && (
            <aside className="w-[24rem] shrink-0">
              <div className="border-line shadow-card sticky top-6 space-y-5 rounded-2xl border p-6">
                <Price apartment={apartment} language={language} />
                <ContactActions
                  agent={apartment.agent_contact}
                  admin={apartment.admin_contact}
                  layout="stack"
                />
              </div>
            </aside>
          )}
        </div>
      </article>

      {!isDesktop && (
        <div className="border-line bg-bg fixed inset-x-0 bottom-0 z-10 space-y-3 border-t px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">
          <Price apartment={apartment} language={language} />
          <ContactActions
            agent={apartment.agent_contact}
            admin={apartment.admin_contact}
            layout="row"
          />
        </div>
      )}

      {viewerIndex !== null && apartment.images.length > 0 && (
        <PhotoViewer
          images={apartment.images}
          startIndex={viewerIndex}
          title={apartment.title}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}
