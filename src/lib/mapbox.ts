import mapboxgl from 'mapbox-gl';

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN || '';

export function initMapbox() {
  if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;
  return mapboxgl;
}

export default initMapbox;