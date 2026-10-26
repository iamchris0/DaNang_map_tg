/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin when frontend and API are served from different hosts. */
  readonly VITE_API_BASE_URL?: string;
  /** MapLibre style JSON URL (vector tiles). */
  readonly VITE_MAP_STYLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
