import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useApartment } from '@/api/catalog';
import { CloseIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { ApartmentSummary } from '@/features/apartment/ApartmentCard';
import { ApartmentPhoto } from '@/features/apartment/ApartmentPhoto';

/** Selected-marker preview: a card floating over the bottom of the map. */
export function ApartmentPreview({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError } = useApartment(id);
  if (id === null) return null;

  return (
    <section
      role="dialog"
      aria-label={data?.title ?? t('common.loading')}
      className="bg-bg text-fg shadow-card absolute inset-x-3 bottom-[calc(5rem+var(--safe-bottom))] z-20 mx-auto max-w-sm overflow-hidden rounded-2xl lg:inset-x-auto lg:right-4 lg:bottom-4 lg:w-[22rem]"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('common.close')}
        className="bg-bg/95 shadow-card absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full"
      >
        <CloseIcon width={16} height={16} />
      </button>
      {isPending ? (
        <div className="text-hint flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : isError ? (
        <p className="text-hint p-6 text-center">{t('apartment.loadError')}</p>
      ) : (
        <>
          <ApartmentPhoto
            image={data.cover_image}
            alt={data.title}
            className="aspect-[16/9] w-full"
            sizes="384px"
            eager
          />
          <div className="flex items-end gap-3 p-4">
            <ApartmentSummary
              apartment={data}
              language={i18n.resolvedLanguage ?? 'en'}
              className="min-w-0 flex-1"
            />
            <Link
              to={`/apartments/${data.id}`}
              className="bg-accent text-accent-fg shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold"
            >
              {t('apartment.viewDetails')}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
