import mapboxgl from 'mapbox-gl';

const getEnv = (name: string) => {
  return typeof process !== 'undefined' ? process.env[name] || '' : '';
};

export const MAPBOX_TOKEN =
  getEnv('NEXT_PUBLIC_MAPBOX_TOKEN') ||
  getEnv('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN');

export const MAPBOX_STYLE = 'mapbox://styles/mapbox/streets-v12';

export function initMapbox() {
  if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;
  return mapboxgl;
}

export default initMapbox;