/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // Google Maps removed (billing risk) - OSM-only endpoints, both have working public fallbacks.
  readonly VITE_OSRM_URL: string;
  readonly VITE_NOMINATIM_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
