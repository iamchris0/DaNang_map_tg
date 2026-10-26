import { type Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre resolves its worker relative to its own module, which breaks once Vite
// pre-bundles or fingerprints it. Point it at the emitted asset explicitly.
setWorkerUrl(workerUrl);

/**
 * Vector tile style. Defaults to OpenFreeMap (free, no key, OSM data). For production
 * traffic, point VITE_MAP_STYLE_URL at a self-hosted or commercial style (MapTiler, Stadia…).
 */
export const MAP_STYLE_URL =
  // `||`: an empty value (e.g. an unset Compose variable) also falls back to the default.
  import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

/** The compact attribution starts expanded and covers small maps; collapse it (ⓘ reopens it). */
export function collapseAttribution(map: MapLibreMap): void {
  map
    .getContainer()
    .querySelector('.maplibregl-ctrl-attrib')
    ?.classList.remove('maplibregl-compact-show');
}
