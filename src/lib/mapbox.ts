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

export async function geocode(query: string): Promise<any> {
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

  if (!result) return null
  return result
}

export async function searchPlaces(query: string): Promise<any[]> {
  assertMapboxConfigured();
  const cleanQuery = query.replace(/, Limpopo.*/i, "").replace(/, South Africa/i, "").trim() + " Polokwane";
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleanQuery)}.json?proximity=29.4589,-23.9045&country=za&limit=5&access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.features || [];
}

export async function reverseGeocode(lng: number | [number, number], lat?: number): Promise<string> {
  assertMapboxConfigured();
  let lngVal: number, latVal: number;
  if (Array.isArray(lng)) {
    lngVal = lng[0];
    latVal = lng[1];
  } else {
    lngVal = lng;
    latVal = lat!;
  }
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lngVal},${latVal}.json?access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) return `${latVal.toFixed(5)}, ${lngVal.toFixed(5)}`;
  const data = await res.json();
  return data.features?.[0]?.place_name || `${latVal.toFixed(5)}, ${lngVal.toFixed(5)}`;
}

// FIXED: Added steps for Buddy turn-by-turn auto navigation inside app
export async function getRoute(from: [number, number], to: [number, number]) {
  assertMapboxConfigured();
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&steps=true&banner_instructions=true&voice_instructions=true&access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Route failed");
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error("No route");
  return {
    geometry: route.geometry,
    distance: route.distance,
    duration: route.duration,
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    legs: route.legs, // for turn by turn
    route: route
  };
}

export const getRouteBetween = getRoute;