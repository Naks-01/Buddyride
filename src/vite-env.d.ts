/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  // Google Maps removed (billing risk) - OSM-only endpoints, both have working public fallbacks.
  readonly VITE_OSRM_URL: string;
  readonly VITE_NOMINATIM_URL: string;
  readonly VITE_MAPBOX_TOKEN: string;
  readonly NEXT_PUBLIC_MAPBOX_TOKEN: string;
  // Restricted (HTTP-referrer-locked) browser key for Maps JS only - Directions calls go through
  // /api/directions so the billable server key never ships to the client.
  readonly VITE_GOOGLE_MAPS_BROWSER_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
