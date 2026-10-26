import 'maplibre-gl/dist/maplibre-gl.css';

import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { collapseAttribution, MAP_STYLE_URL } from '@/features/map/config';
import { hasWebGL } from '@/features/map/webgl';
import { DA_NANG_CENTER, MAX_BOUNDS } from '@/lib/geo';

export interface LatLng {
  latitude: number;
  longitude: number;
}

interface Props {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
}

const PIN_ZOOM = 15.5;

/** Tap to place the pin, drag it to adjust. */
export default function LocationPickerMap({ value, onChange }: Props) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [supported] = useState(hasWebGL);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const emit = useEffectEvent((next: LatLng) => {
    onChange(next);
  });
  const initial = useRef(value);

  useEffect(() => {
    if (!container.current || !supported) return;
    const start = initial.current;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: MAP_STYLE_URL,
        center: start ? [start.longitude, start.latitude] : DA_NANG_CENTER,
        zoom: start ? PIN_ZOOM : 11.5,
        maxBounds: MAX_BOUNDS,
        attributionControl: { compact: true },
        dragRotate: false,
        touchPitch: false,
      });
    } catch (error) {
      console.error('Map initialisation failed', error);
      return;
    }
    instance.touchZoomRotate.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    instance.on('load', () => {
      collapseAttribution(instance);
    });
    instance.on('click', (event) => {
      emit({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
    });
    const frame = requestAnimationFrame(() => {
      setMap(instance);
    });
    return () => {
      cancelAnimationFrame(frame);
      marker.current = null;
      instance.remove();
      setMap(null);
    };
  }, [supported]);

  // Keep the draggable pin in sync with the form value.
  useEffect(() => {
    if (!map) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    const lngLat: [number, number] = [value.longitude, value.latitude];
    if (!marker.current) {
      const instance = new Marker({ draggable: true, color: '#2481cc' })
        .setLngLat(lngLat)
        .addTo(map);
      instance.on('dragend', () => {
        const position = instance.getLngLat();
        emit({ latitude: position.lat, longitude: position.lng });
      });
      marker.current = instance;
    } else {
      marker.current.setLngLat(lngLat);
    }
    // Bring the pin into view at street level (e.g. after picking a search result).
    if (!map.getBounds().contains(lngLat) || map.getZoom() < 14) {
      map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), PIN_ZOOM) });
    }
  }, [map, value]);

  if (!supported) return null;
  return (
    <div
      ref={container}
      role="application"
      aria-label={t('admin.location.mapLabel')}
      data-testid="location-picker"
      className="bg-bg h-72 w-full overflow-hidden rounded-xl"
    />
  );
}
