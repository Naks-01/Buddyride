// Waze-level place search for Limpopo with NO Google Cloud dependency:
// 1) instant offline seed data (src/data/limpopoPlaces.ts + lib/polokwane.ts)
// 2) Mapbox Search Box API (free tier, needs VITE_MAPBOX_TOKEN) - best road/POI coverage
// 3) Photon (OpenStreetMap, no key) - best for villages/farms/small places Mapbox misses
// 4) Nominatim (OpenStreetMap, no key) - final fallback
import { LIMPOPO_PLACES, searchLimpopoPlaces, type PlaceCategory } from '../data/limpopoPlaces';
import { POLOKWANE_PLACES } from './polokwane';

export type SearchPlace = {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  category: PlaceCategory | 'place';
  source: 'local' | 'mapbox' | 'photon' | 'nominatim';
  mapboxId?: string;
};

const LIMPOPO_PROXIMITY = { lat: -23.9045, lng: 29.4689 };
// left,bottom,right,top - covers the whole of Limpopo province with margin.
const LIMPOPO_VIEWBOX = '26.5,-25.5,31.5,-22.0';

export const ICON_BY_CATEGORY: Record<SearchPlace['category'], string> = {
  hospital: '🏥',
  mall: '🏬',
  taxi_rank: '🚕',
  town: '📍',
  suburb: '📍',
  landmark: '🏛️',
  airport: '✈️',
  place: '📍',
};

function guessCategory(text: string): PlaceCategory | 'place' {
  const lower = text.toLowerCase();
  if (/hospital|clinic|medi.?clinic/.test(lower)) return 'hospital';
  if (/mall|shopping centre|shopping center|makro|game city/.test(lower)) return 'mall';
  if (/taxi rank|rank\b/.test(lower)) return 'taxi_rank';
  if (/airport/.test(lower)) return 'airport';
  return 'place';
}

function roundKey(lat: number, lng: number) {
  // ~50m grid - close enough to treat as "the same place" across sources.
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function localSeedResults(query: string): SearchPlace[] {
  const seeded = [
    ...searchLimpopoPlaces(query),
    ...POLOKWANE_PLACES.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase())).map((p) => ({
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      category: 'landmark' as PlaceCategory,
    })),
  ];
  return seeded.map((place) => ({
    id: `local-${place.lat}-${place.lng}`,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    source: 'local',
  }));
}

// Mapbox Search Box /suggest returns NO coordinates (two-step API) - call retrieveMapboxSuggestion
// with the returned mapboxId once the user picks this result.
async function searchMapbox(query: string, sessionToken: string): Promise<SearchPlace[]> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) return [];
  try {
    const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(query)}&language=en&country=ZA&proximity=${LIMPOPO_PROXIMITY.lng},${LIMPOPO_PROXIMITY.lat}&session_token=${sessionToken}&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const suggestions: Array<{ mapbox_id: string; name: string; place_formatted?: string; full_address?: string; feature_type?: string }> = data.suggestions ?? [];
    return suggestions.map((s) => ({
      id: `mapbox-${s.mapbox_id}`,
      name: s.name,
      address: s.full_address ?? s.place_formatted ?? s.name,
      lat: null,
      lng: null,
      category: guessCategory(`${s.name} ${s.feature_type ?? ''}`),
      source: 'mapbox' as const,
      mapboxId: s.mapbox_id,
    }));
  } catch (err) {
    console.error('Mapbox search failed:', err);
    return [];
  }
}

// Call this when the user selects a Mapbox-sourced suggestion to resolve its lat/lng.
export async function retrieveMapboxSuggestion(mapboxId: string, sessionToken: string): Promise<{ lat: number; lng: number } | null> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${mapboxId}?session_token=${sessionToken}&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords)) return null;
    return { lat: coords[1], lng: coords[0] };
  } catch (err) {
    console.error('Mapbox retrieve failed:', err);
    return null;
  }
}

async function searchPhoton(query: string): Promise<SearchPlace[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' Limpopo')}&lat=${LIMPOPO_PROXIMITY.lat}&lon=${LIMPOPO_PROXIMITY.lng}&limit=10`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const features: Array<{ properties: Record<string, string>; geometry: { coordinates: [number, number] } }> = data.features ?? [];
    return features
      .filter((f) => f.properties?.name)
      .map((f) => {
        const props = f.properties;
        const addressParts = [props.name, props.street, props.city ?? props.town ?? props.village, props.state].filter(Boolean);
        const [lng, lat] = f.geometry.coordinates;
        return {
          id: `photon-${lat}-${lng}`,
          name: props.name,
          address: addressParts.join(', '),
          lat,
          lng,
          category: guessCategory(`${props.name} ${props.osm_value ?? ''}`),
          source: 'photon' as const,
        };
      });
  } catch (err) {
    console.error('Photon search failed:', err);
    return [];
  }
}

async function searchNominatim(query: string): Promise<SearchPlace[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Limpopo South Africa')}&viewbox=${LIMPOPO_VIEWBOX}&bounded=1&limit=10&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return [];
    const data: Array<{ display_name: string; lat: string; lon: string; type?: string }> = await res.json();
    return data.map((r) => ({
      id: `nominatim-${r.lat}-${r.lon}`,
      name: r.display_name.split(',')[0],
      address: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      category: guessCategory(`${r.display_name} ${r.type ?? ''}`),
      source: 'nominatim' as const,
    }));
  } catch (err) {
    console.error('Nominatim search failed:', err);
    return [];
  }
}

// Runs all sources in parallel, then de-dupes by rounded coordinates (local seed data wins,
// since it's curated and instant) and keeps Mapbox suggestions even without coords yet.
export async function searchLimpopo(query: string, sessionToken: string): Promise<SearchPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const local = localSeedResults(trimmed);
  const [mapbox, photon, nominatim] = await Promise.all([
    searchMapbox(trimmed, sessionToken),
    searchPhoton(trimmed),
    searchNominatim(trimmed),
  ]);

  const seen = new Set<string>(local.map((p) => (p.lat != null && p.lng != null ? roundKey(p.lat, p.lng) : '')));
  const merged = [...local];

  for (const place of [...photon, ...nominatim]) {
    if (place.lat == null || place.lng == null) continue;
    const key = roundKey(place.lat, place.lng);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
  }

  // Mapbox suggestions have no coordinates yet, so just dedupe by name+address text.
  const seenNames = new Set(merged.map((p) => `${p.name}|${p.address}`.toLowerCase()));
  for (const place of mapbox) {
    const nameKey = `${place.name}|${place.address}`.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    merged.push(place);
  }

  return merged.slice(0, 20);
}

export { LIMPOPO_PLACES };
