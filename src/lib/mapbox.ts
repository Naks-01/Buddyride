import mapboxgl from 'mapbox-gl';

export const MAPBOX_TOKEN =
  import.meta.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  import.meta.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
  import.meta.env.VITE_MAPBOX_TOKEN ||
  '';

export const MAPBOX_STYLE = 'mapbox://styles/mapbox/streets-v12';

export function initMapbox() {
  if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;
  return mapboxgl;
}

export default initMapbox;