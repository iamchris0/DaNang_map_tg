/**
 * Minimal stand-in for maplibre-gl in jsdom (no WebGL). Markers are real DOM nodes appended
 * to the map container, so marker interactions can be tested like any other UI.
 */
type Handler = (event: unknown) => void;

export const BOUNDS = { west: 108.0, south: 15.9, east: 108.4, north: 16.2 };
export const maps: FakeMap[] = [];

export class FakeMap {
  readonly container: HTMLElement;
  readonly canvasContainer: HTMLElement;
  readonly options: Record<string, unknown>;
  readonly handlers = new Map<string, Handler[]>();
  readonly easeTo = vi.fn();
  touchZoomRotate = { disableRotation: vi.fn() };

  constructor(options: { container: HTMLElement } & Record<string, unknown>) {
    this.options = options;
    this.container = options.container;
    this.canvasContainer = document.createElement('div');
    this.canvasContainer.className = 'maplibregl-canvas-container';
    this.container.appendChild(this.canvasContainer);
    maps.push(this);
  }
  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  fire(event: string, payload: unknown = {}) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }
  getBounds() {
    return {
      contains: () => true,
      getWest: () => BOUNDS.west,
      getSouth: () => BOUNDS.south,
      getEast: () => BOUNDS.east,
      getNorth: () => BOUNDS.north,
    };
  }
  getZoom() {
    return 12;
  }
  getCenter() {
    return { lng: 108.2, lat: 16.05 };
  }
  project() {
    return { x: 600, y: 100 };
  }
  getContainer() {
    return this.container;
  }
  getCanvasContainer() {
    return this.canvasContainer;
  }
  addControl() {
    return this;
  }
  remove() {
    this.canvasContainer.remove();
  }
}

export const markers: FakeMarker[] = [];

export class FakeMarker {
  private readonly element: HTMLElement;
  readonly options: Record<string, unknown>;
  private readonly handlers = new Map<string, Handler[]>();
  lngLat: [number, number] = [0, 0];

  constructor(options: { element?: HTMLElement } & Record<string, unknown> = {}) {
    this.options = options;
    this.element = options.element ?? document.createElement('div');
    this.element.classList.add('maplibregl-marker');
    markers.push(this);
  }
  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  getLngLat() {
    return { lng: this.lngLat[0], lat: this.lngLat[1] };
  }
  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  /** Simulate dragging the marker to a new position. */
  dragTo(lng: number, lat: number) {
    this.lngLat = [lng, lat];
    for (const handler of this.handlers.get('dragend') ?? []) handler({});
  }
  addTo(map: FakeMap) {
    map.getCanvasContainer().appendChild(this.element);
    return this;
  }
  remove() {
    this.element.remove();
  }
  addClassName(name: string) {
    this.element.classList.add(name);
  }
  removeClassName(name: string) {
    this.element.classList.remove(name);
  }
}

export const maplibreModule = {
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: vi.fn(),
  setWorkerUrl: vi.fn(),
};
