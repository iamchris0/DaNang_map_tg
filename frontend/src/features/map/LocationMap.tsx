import 'maplibre-gl/dist/maplibre-gl.css';

import { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { LocationPrecision } from '@/api/types';
import { PinIcon } from '@/components/ui/icons';

import { collapseAttribution, MAP_STYLE_URL } from './config';
import { HtmlMarker } from './HtmlMarker';
import { hasWebGL } from './webgl';

interface Props {
  latitude: number;
  longitude: number;
  precision: LocationPrecision;
}

/** Static location preview. Approximate locations show an area, never a precise pin. */
export default function LocationMap({ latitude, longitude, precision }: Props) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [supported] = useState(hasWebGL);
  const approximate = precision === 'approximate';

  useEffect(() => {
    if (!container.current || !supported) return;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: MAP_STYLE_URL,
        center: [longitude, latitude],
        zoom: approximate ? 14 : 15.5,
        interactive: false,
        attributionControl: { compact: true },
      });
    } catch (error) {
      console.error('Map initialisation failed', error);
      return;
    }
    instance.on('load', () => {
      collapseAttribution(instance);
      setMap(instance);
    });
    return () => {
      instance.remove();
      setMap(null);
    };
  }, [latitude, longitude, approximate, supported]);

  if (!supported) return null;

  return (
    <div
      ref={container}
      role="img"
      aria-label={t(approximate ? 'apartment.approximateLocation' : 'apartment.exactLocation')}
      className="bg-surface h-48 w-full overflow-hidden rounded-2xl"
    >
      {map && (
        <HtmlMarker
          map={map}
          longitude={longitude}
          latitude={latitude}
          anchor={approximate ? 'center' : 'bottom'}
        >
          {approximate ? (
            <span className="border-accent bg-accent/20 block size-28 rounded-full border-2" />
          ) : (
            <PinIcon width={36} height={36} className="fill-accent text-white drop-shadow" />
          )}
        </HtmlMarker>
      )}
    </div>
  );
}
