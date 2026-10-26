import 'maplibre-gl/dist/maplibre-gl.css';

import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Supercluster from 'supercluster';

import type { MapMarker } from '@/api/types';
import { type BBox, DA_NANG_CENTER, DEFAULT_ZOOM, MAX_BOUNDS, roundBBox } from '@/lib/geo';
import { hapticSelection } from '@/telegram/webapp';

import { MAP_STYLE_URL } from './config';
import { HtmlMarker } from './HtmlMarker';
import { PriceMarker } from './PriceMarker';
import { hasWebGL } from './webgl';

export interface MapViewProps {
  markers: MapMarker[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onViewportChange: (bbox: BBox) => void;
}

interface Viewport {
  bounds: BBox;
  zoom: number;
}

const MOBILE_QUERY = '(max-width: 767px)';

/** Camera of the last map instance, so coming back from a listing restores the view. */
let lastCamera: { center: [number, number]; zoom: number } | null = null;
const SIDE_PANEL_PX = 384 + 12;

export default function MapView({ markers, selectedId, onSelect, onViewportChange }: MapViewProps) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [supported] = useState(hasWebGL);
  // Read the latest props from map listeners without re-creating the map.
  const handleViewport = useEffectEvent((bbox: BBox, zoom: number) => {
    setViewport({ bounds: bbox, zoom });
    onViewportChange(roundBBox(bbox));
  });
  const handleBackgroundClick = useEffectEvent(() => {
    onSelect(null);
  });

  useEffect(() => {
    if (!container.current || !supported) return;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: MAP_STYLE_URL,
        center: lastCamera?.center ?? DA_NANG_CENTER,
        zoom: lastCamera?.zoom ?? DEFAULT_ZOOM,
        maxBounds: MAX_BOUNDS,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch (error) {
      console.error('Map initialisation failed', error);
      return;
    }
    instance.touchZoomRotate.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    const emitViewport = () => {
      const bounds = instance.getBounds();
      const bbox: BBox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
      const center = instance.getCenter();
      lastCamera = { center: [center.lng, center.lat], zoom: instance.getZoom() };
      handleViewport(bbox, instance.getZoom());
    };
    // Markers and data don't depend on tiles: start right away instead of waiting for 'load'.
    const frame = requestAnimationFrame(() => {
      setMap(instance);
      emitViewport();
    });
    instance.on('moveend', emitViewport);
    instance.on('click', (event) => {
      const target = event.originalEvent.target as Element | null;
      if (!target?.closest('.maplibregl-marker')) handleBackgroundClick();
    });

    return () => {
      cancelAnimationFrame(frame);
      instance.remove();
      setMap(null);
    };
  }, [supported]);

  const index = useMemo(() => {
    const cluster = new Supercluster<MapMarker>({ radius: 56, maxZoom: 16 });
    cluster.load(
      markers.map((marker) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [marker.longitude, marker.latitude] },
        properties: marker,
      })),
    );
    return cluster;
  }, [markers]);

  const features = viewport ? index.getClusters(viewport.bounds, Math.floor(viewport.zoom)) : [];

  const select = (id: string) => {
    hapticSelection();
    onSelect(id);
    const marker = markers.find((m) => m.id === id);
    if (!map || !marker) return;
    // Pan only if the preview would hide the pin: the bottom sheet on phones,
    // the left side panel (24rem) on wider screens.
    const point = map.project([marker.longitude, marker.latitude]);
    const { clientHeight } = map.getContainer();
    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    const hidden = mobile ? point.y > clientHeight * 0.45 : point.x < SIDE_PANEL_PX + 24;
    if (hidden) {
      map.easeTo({
        center: [marker.longitude, marker.latitude],
        offset: mobile ? [0, -clientHeight * 0.2] : [SIDE_PANEL_PX / 2, 0],
        duration: 300,
      });
    }
  };

  if (!supported) {
    return (
      <div className="text-hint flex h-full items-center justify-center p-6 text-center">
        {t('map.unavailable')}
      </div>
    );
  }

  return (
    <div
      ref={container}
      role="region"
      aria-label={t('map.label')}
      className="h-full w-full"
      data-testid="map"
    >
      {map &&
        features.map((feature) => {
          const [longitude, latitude] = feature.geometry.coordinates as [number, number];
          if ('cluster' in feature.properties) {
            const { cluster_id: clusterId, point_count: count } = feature.properties;
            return (
              <HtmlMarker
                key={`cluster-${clusterId}`}
                map={map}
                longitude={longitude}
                latitude={latitude}
              >
                <button
                  type="button"
                  aria-label={t('map.cluster', { count })}
                  onClick={() => {
                    map.easeTo({
                      center: [longitude, latitude],
                      zoom: Math.min(index.getClusterExpansionZoom(clusterId), 17),
                    });
                  }}
                  className="border-bg bg-ink text-ink-fg shadow-card flex size-11 items-center justify-center rounded-full border-2 text-sm font-bold transition-transform hover:scale-105"
                >
                  {count}
                </button>
              </HtmlMarker>
            );
          }
          const marker = feature.properties;
          const selected = marker.id === selectedId;
          return (
            <HtmlMarker
              key={marker.id}
              map={map}
              longitude={longitude}
              latitude={latitude}
              raised={selected}
            >
              <PriceMarker marker={marker} selected={selected} onSelect={select} />
            </HtmlMarker>
          );
        })}
    </div>
  );
}
