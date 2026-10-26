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
      className={`relative min-h-8 rounded-full border-2 px-2.5 py-1 text-[13px] leading-none font-bold whitespace-nowrap shadow-md transition-transform active:scale-95 ${
        selected
          ? 'border-accent bg-accent text-accent-fg scale-110'
          : 'border-white bg-white text-neutral-900'
      } ${approximate && !selected ? 'border-dashed border-neutral-400' : ''}`}
    >
      {approximate ? '~' : ''}
      {price}
    </button>
  );
}
