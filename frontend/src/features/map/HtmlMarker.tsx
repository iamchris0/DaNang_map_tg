import { Map as MapLibreMap, Marker, type PositionAnchor } from 'maplibre-gl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  map: MapLibreMap;
  longitude: number;
  latitude: number;
  anchor?: PositionAnchor;
  /** Draw above sibling markers (e.g. the selected one). */
  raised?: boolean;
  children: ReactNode;
}

/** A MapLibre marker whose content is rendered by React (keeps markers accessible buttons). */
export function HtmlMarker({
  map,
  longitude,
  latitude,
  anchor = 'center',
  raised = false,
  children,
}: Props) {
  const [element] = useState(() => document.createElement('div'));
  const marker = useRef<Marker | null>(null);

  useEffect(() => {
    const instance = new Marker({ element, anchor }).setLngLat([longitude, latitude]).addTo(map);
    marker.current = instance;
    return () => {
      instance.remove();
      marker.current = null;
    };
    // Position updates are handled below without recreating the marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, element, anchor]);

  useEffect(() => {
    marker.current?.setLngLat([longitude, latitude]);
  }, [longitude, latitude]);

  useEffect(() => {
    const instance = marker.current;
    if (!raised || !instance) return;
    instance.addClassName('z-10');
    return () => {
      instance.removeClassName('z-10');
    };
  }, [raised, map, element, anchor]);

  return createPortal(children, element);
}
