// Limpopo town centers for default map views
export const LIMPOPO_TOWNS = {
  Polokwane: { lat: -23.9045, lng: 29.7167, zoom: 12 },
  Tzaneen: { lat: -23.8333, lng: 30.1667, zoom: 12 },
  Giyani: { lat: -23.2963, lng: 30.7155, zoom: 12 },
  Thohoyandou: { lat: -22.9450, lng: 30.4849, zoom: 12 },
};

// Default center: Polokwane (capital of Limpopo)
export const DEFAULT_CENTER: [number, number] = [-23.9045, 29.7167];
export const DEFAULT_ZOOM = 13;

// Google Maps removed (billing risk) - map rendering is OSM/Leaflet-only via components/Map/AppMap.tsx.

// Haversine distance calculation in km
export function calcDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

// Find nearest town based on coordinates
export function nearestTown(lat: number, lng: number): string {
  let nearest = 'Polokwane';
  let minDist = Infinity;
  for (const [town, coords] of Object.entries(LIMPOPO_TOWNS)) {
    const dist = calcDistance(lat, lng, coords.lat, coords.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = town;
    }
  }
  return nearest;
}
