const mapbox_access_token = import.meta.env.VITE_MAPBOX_TOKEN as string;

export function assertMapboxConfigured() {
  if (!mapbox_access_token) {
    throw new Error("VITE_MAPBOX_TOKEN missing");
  }
}

async function fetchGeocode(query: string, extra: string = ""): Promise<[number, number] | null> {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${extra}country=za&limit=5&access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.features?.length) return null;
  return data.features[0].geometry.coordinates as [number, number];
}

export async function geocode(query: string): Promise<[number, number] | null> {
  assertMapboxConfigured();
  const cleanQuery = query.replace(/, Limpopo.*/i, "").replace(/, South Africa/i, "").trim();

  let result = await fetchGeocode(cleanQuery, "proximity=29.4589,-23.9045&bbox=29.1,-24.15,29.85,-23.65&");
  if (!result) {
    result = await fetchGeocode(cleanQuery, "proximity=29.4589,-23.9045&");
  }
  if (!result) {
    result = await fetchGeocode(cleanQuery, "");
  }
  if (!result &&!cleanQuery.toLowerCase().includes("polokwane")) {
    result = await fetchGeocode(cleanQuery + " Polokwane", "proximity=29.4589,-23.9045&");
  }
  return result;
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