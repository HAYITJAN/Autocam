/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DISPLAY_TIMEZONE?: string;
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_ATTRIBUTION?: string;
  readonly VITE_MAP_SATELLITE_URL?: string;
  readonly VITE_MAP_SATELLITE_ATTRIBUTION?: string;
  readonly VITE_MAP_SATELLITE_LABELS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
