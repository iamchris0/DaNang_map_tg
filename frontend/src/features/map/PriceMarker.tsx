import { useTranslation } from 'react-i18next';

import type { MapMarker } from '@/api/types';
import { roomsLabel } from '@/features/apartment/labels';
import { formatPriceCompact } from '@/lib/format';

interface Props {
  marker: MapMarker;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Price pill. Approximate locations get a dashed outline and a "~" prefix. */
export function PriceMarker({ marker, selected, onSelect }: Props) {
  const { t, i18n } = useTranslation();
  const price = formatPriceCompact(marker.price_vnd, i18n.resolvedLanguage ?? 'en');
  const approximate = marker.location_precision === 'approximate';
  const rooms = roomsLabel(t, marker.bedrooms);

  return (
    <button
      type="button"
      data-marker-id={marker.id}
      aria-pressed={selected}
      aria-label={t(approximate ? 'map.markerApproximate' : 'map.marker', { price, rooms })}
      onClick={() => {
        onSelect(marker.id);
      }}
      className={`shadow-card relative min-h-8 rounded-full px-3 py-1.5 text-sm leading-none font-bold whitespace-nowrap transition-transform hover:scale-105 active:scale-95 ${
        selected
          ? 'bg-ink text-ink-fg scale-110'
          : approximate
            ? 'border-hint bg-bg text-fg border border-dashed'
            : 'bg-bg text-fg'
      }`}
    >
      {approximate ? '~' : ''}
      {price}
    </button>
  );
}
