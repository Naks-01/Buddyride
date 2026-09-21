import mapboxgl from 'mapbox-gl';

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export function initMapbox() {
  if (MAPBOX_TOKEN) {
    mapboxgl.accessToken = MAPBOX_TOKEN;
  } else {
    console.warn('Mapbox token missing - add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to .env.local');
  }
  return mapboxgl;
}

export default initMapbox;