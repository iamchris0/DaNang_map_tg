import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useApartment } from '@/api/catalog';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { ApartmentSummary } from '@/features/apartment/ApartmentCard';
import { ApartmentPhoto } from '@/features/apartment/ApartmentPhoto';

/** Selected-marker preview: bottom sheet on phones, side panel on desktop. */
export function ApartmentPreview({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError } = useApartment(id);

  return (
    <Sheet
      open={id !== null}
      onClose={onClose}
      title={data?.title ?? t('common.loading')}
      hideTitle
      variant="panel"
    >
      {isPending ? (
        <div className="text-hint flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : isError ? (
        <p className="text-hint py-8 text-center">{t('apartment.loadError')}</p>
      ) : (
        <div className="-mx-4 -mt-2">
          <ApartmentPhoto
            image={data.cover_image}
            alt={data.title}
            className="aspect-[16/9] w-full md:rounded-t-2xl"
            eager
          />
          <ApartmentSummary apartment={data} language={i18n.resolvedLanguage ?? 'en'} />
          <div className="px-3 pb-1">
            <Link
              to={`/apartments/${data.id}`}
              className="bg-accent text-accent-fg flex min-h-12 items-center justify-center rounded-xl font-semibold"
            >
              {t('apartment.viewDetails')}
            </Link>
          </div>
        </div>
      )}
    </Sheet>
  );
}
