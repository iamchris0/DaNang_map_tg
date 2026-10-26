import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMapMarkers } from '@/api/catalog';
import type { MapMarker } from '@/api/types';
import { Spinner } from '@/components/ui/Spinner';
import type { CatalogFilters } from '@/features/filters/filters';
import type { BBox } from '@/lib/geo';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

import { ApartmentPreview } from './ApartmentPreview';

const MapView = lazy(() => import('@/features/map/MapView'));
const NO_MARKERS: MapMarker[] = [];

interface Props {
  filters: CatalogFilters;
  onReset: () => void;
  /** Reports the visible area (debounced), e.g. so the list can follow the map. */
  onViewportChange?: (bbox: BBox) => void;
  showCount?: boolean;
}

export function MapPanel({ filters, onReset, onViewportChange, showCount = true }: Props) {
  const { t } = useTranslation();
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useMapMarkers(useDebouncedValue(bbox, 200), filters);
  const markers = query.data?.markers ?? NO_MARKERS;

  return (
    <div className="relative h-full">
      <Suspense
        fallback={
          <div className="bg-surface text-hint flex h-full items-center justify-center">
            <Spinner />
          </div>
        }
      >
        <MapView
          markers={markers}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onViewportChange={(next) => {
            setBbox(next);
            onViewportChange?.(next);
          }}
        />
      </Suspense>

      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
        <div
          role="status"
          className={`bg-bg shadow-card pointer-events-auto flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
            showCount || query.isError || query.data?.total === 0 || query.data?.truncated
              ? ''
              : 'sr-only'
          }`}
        >
          {query.isFetching && <Spinner className="size-3.5" />}
          {query.isError ? (
            <>
              <span>{t('catalog.loadError')}</span>
              <button
                type="button"
                className="text-accent underline"
                onClick={() => void query.refetch()}
              >
                {t('common.retry')}
              </button>
            </>
          ) : query.data ? (
            query.data.total === 0 ? (
              <>
                <span className="font-normal">{t('catalog.emptyArea')}</span>
                <button type="button" className="shrink-0 underline" onClick={onReset}>
                  {t('catalog.resetFilters')}
                </button>
              </>
            ) : query.data.truncated ? (
              <span>
                {t('catalog.truncated', {
                  shown: query.data.markers.length,
                  total: query.data.total,
                })}
              </span>
            ) : (
              <span>{t('catalog.inArea', { count: query.data.total })}</span>
            )
          ) : (
            <span>{t('common.loading')}</span>
          )}
        </div>
      </div>

      <ApartmentPreview
        id={selectedId}
        onClose={() => {
          setSelectedId(null);
        }}
      />
    </div>
  );
}
