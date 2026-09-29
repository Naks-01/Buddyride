import mapboxgl from 'mapbox-gl';

// @ts-ignore
const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
export const MAPBOX_TOKEN = token ? token : '';

export function initMapbox() {
  if (MAPBOX_TOKEN) {
    mapboxgl.accessToken = MAPBOX_TOKEN;
  }
  return mapboxgl;
}