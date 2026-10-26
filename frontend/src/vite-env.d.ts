/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin when frontend and API are served from different hosts. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
