// Waze-level place search for Limpopo with ZERO API keys required:
// 1) instant offline seed data (src/data/limpopoFull.ts + lib/polokwane.ts)
// 2) Photon (OpenStreetMap, no key) - primary network source, best for Limpopo villages/farms
// 3) Nominatim (OpenStreetMap, no key) - fallback, bounded to the Limpopo viewbox
import { LIMPOPO_FULL, searchLimpopoFull, type PlaceType } from '../data/limpopoFull';
import { POLOKWANE_PLACES } from './polokwane';

export type SearchPlace = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type: PlaceType | 'place';
  source: 'local' | 'photon' | 'nominatim';
};

const LIMPOPO_CENTER = { lat: -23.9045, lng: 29.4689 };
// left,bottom,right,top - covers the whole of Limpopo province with margin.
const LIMPOPO_VIEWBOX = '26.5,-25.5,31.5,-22.0';

export const ICON_BY_TYPE: Record<SearchPlace['type'], string> = {
  hospital: '🏥',
  mall: '🏬',
  shop: '🛒',
  taxi_rank: '🚕',
  town: '📍',
  suburb: '📍',
  village: '📍',
  landmark: '🏛️',
  airport: '✈️',
  place: '📍',
};

function guessType(text: string): PlaceType | 'place' {
  const lower = text.toLowerCase();
  if (/hospital|clinic|medi.?clinic/.test(lower)) return 'hospital';
  if (/mall|shopping centre|shopping center|plaza|lifestyle centre/.test(lower)) return 'mall';
  if (/makro|game|builders|checkers|shoprite|pick n pay|spar\b/.test(lower)) return 'shop';
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
    ...searchLimpopoFull(query),
    ...POLOKWANE_PLACES.filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(query.toLowerCase())).map((p) => ({
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      type: 'landmark' as PlaceType,
    })),
  ];
  return seeded.map((place) => ({
    id: `local-${place.lat}-${place.lng}`,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    type: place.type,
    source: 'local',
  }));
}

async function searchPhoton(query: string): Promise<SearchPlace[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' Limpopo')}&lat=${LIMPOPO_CENTER.lat}&lon=${LIMPOPO_CENTER.lng}&limit=10&lang=en`;
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
          type: guessType(`${props.name} ${props.osm_value ?? ''}`),
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
    const res = await fetch(url, { headers: { 'User-Agent': 'BuddyRide/1.0' } });
    if (!res.ok) return [];
    const data: Array<{ display_name: string; lat: string; lon: string; type?: string }> = await res.json();
    return data.map((r) => ({
      id: `nominatim-${r.lat}-${r.lon}`,
      name: r.display_name.split(',')[0],
      address: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
      type: guessType(`${r.display_name} ${r.type ?? ''}`),
      source: 'nominatim' as const,
    }));
  } catch (err) {
    console.error('Nominatim search failed:', err);
    return [];
  }
}

// Local seed data resolves instantly; Photon (primary) and Nominatim (fallback) run in parallel
// and are merged in, de-duped by rounded coordinates (local seed data wins - it's curated).
export async function searchLimpopo(query: string): Promise<SearchPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const local = localSeedResults(trimmed);
  const [photon, nominatim] = await Promise.all([searchPhoton(trimmed), searchNominatim(trimmed)]);

  const seen = new Set<string>(local.map((p) => roundKey(p.lat, p.lng)));
  const merged = [...local];

  for (const place of [...photon, ...nominatim]) {
    const key = roundKey(place.lat, place.lng);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
  }

  return merged.slice(0, 15);
}

export { LIMPOPO_FULL };
