import mapboxgl from 'mapbox-gl';

const token = import.meta.env.VITE_MAPBOX_TOKEN;
export const MAPBOX_TOKEN = token ? token : '';

export function initMapbox() {
  if (MAPBOX_TOKEN) {
    mapboxgl.accessToken = MAPBOX_TOKEN;
  }
  return mapboxgl;
}