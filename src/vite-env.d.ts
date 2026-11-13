/// <reference types="vite/client" />

interface ImportMetaEnv {
  // FIX: Old types said these are always string - they are NOT. If .env.local is missing, they are undefined, and isSupabaseConfigured in lib/supabase.ts checks for that. Required string typing hid the missing-env bug from TS.
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  // FIX: Mapbox IS used - DriverNavigationView uses mapbox-gl for driver turn-by-turn navigation.
  // Passenger map / search uses OpenStreetMap + Nominatim, but driver nav needs this token. Do NOT delete it.
  readonly VITE_MAPBOX_TOKEN?: string
  // Optional - only if you use them
  readonly VITE_PAYSTACK_PUBLIC_KEY?: string
  readonly VITE_APP_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}