/** [min_lng, min_lat, max_lng, max_lat] */
export type BBox = [number, number, number, number];

export const DA_NANG_CENTER: [number, number] = [108.212, 16.052];
export const DEFAULT_ZOOM = 11.8;
/** Panning limit: Da Nang incl. Hoa Vang, with some margin. */
export const MAX_BOUNDS: BBox = [107.6, 15.7, 108.6, 16.4];

/** Round to ~100 m so tiny pans reuse the cached query. */
export function roundBBox(bbox: BBox): BBox {
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return [round(bbox[0]), round(bbox[1]), round(bbox[2]), round(bbox[3])];
}
