const mapbox_access_token = import.meta.env.VITE_MAPBOX_TOKEN as string;

export function assertMapboxConfigured() {
  if (!mapbox_access_token) {
    throw new Error("VITE_MAPBOX_TOKEN is missing in.env.local");
  }
}

const POLOKWANE_PROXIMITY = "29.4689,-23.9045";
const POLOKWANE_BBOX = "29.25,-24.05,29.65,-23.75";

export async function geocode(query: string): Promise<[number, number] | null> {
  assertMapboxConfigured();
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?proximity=${POLOKWANE_PROXIMITY}&bbox=${POLOKWANE_BBOX}&country=za&limit=5&access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if (!data.features?.length) return null;
  return data.features[0].geometry.coordinates as [number, number];
}

export async function reverseGeocode(lng: number, lat: number): Promise<string> {
  assertMapboxConfigured();
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const data = await res.json();
  return data.features?.[0]?.place_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export async function getRoute(from: [number, number], to: [number, number]) {
  assertMapboxConfigured();
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Route failed");
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("No route");
  return {
    geometry: route.geometry,
    distance: route.distance / 1000,
    duration: route.duration / 60,
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    route: route
  };
}

export const getRouteBetween = getRoute;