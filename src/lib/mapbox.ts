const mapbox_access_token = import.meta.env.VITE_MAPBOX_TOKEN as string;

export function assertMapboxConfigured() {
  if (!mapbox_access_token) {
    throw new Error("VITE_MAPBOX_TOKEN missing");
  }
}

async function fetchGeocodeRaw(query: string, extra: string = ""): Promise<any> {
  // Added: types=poi first, fuzzyMatch, autocomplete
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${extra}country=za&limit=6&types=poi,address,place,locality&fuzzyMatch=true&autocomplete=true&access_token=${mapbox_access_token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

// For suggestions - returns features array (what PassengerHome needs)
export async function geocode(query: string): Promise<any> {
  assertMapboxConfigured();
  const cleanQuery = query.replace(/, Limpopo.*/i, "").replace(/, South Africa/i, "").trim();

  // 1. Try exact + Polokwane bias + bbox (most accurate for Polokwane)
  let data = await fetchGeocodeRaw(cleanQuery, "proximity=29.4589,-23.9045&bbox=29.1,-24.15,29.85,-23.65&");

  // 2. If no result, try with just proximity
  if (!data?.features?.length) {
    data = await fetchGeocodeRaw(cleanQuery, "proximity=29.4589,-23.9045&");
  }
  // 3. If still no result, try WITHOUT adding Polokwane - this fixes Puma makgofe
  if (!data?.features?.length) {
    data = await fetchGeocodeRaw(cleanQuery, "");
  }
  // 4. LAST resort only - add Polokwane
  if (!data?.features?.length &&!cleanQuery.toLowerCase().includes("polokwane")) {
    data = await fetchGeocodeRaw(cleanQuery + " Polokwane", "proximity=29.4589,-23.9045&");
  }

  return data
}

// For getting coords quickly
export async function geocodeCoords(query: string): Promise<[number, number] | null> {
  const data = await geocode(query)
  if (!data?.features?.length) return null
  return data.features[0].center || data.features[0].geometry?.coordinates || null
}

export async function searchPlaces(query: string): Promise<any[]> {
  assertMapboxConfigured();
  const cleanQuery = query.replace(/, Limpopo.*/i, "").replace(/, South Africa/i, "").trim();
  // DON'T force + Polokwane here, let geocode() handle it
  const data = await geocode(cleanQuery);
  return data?.features || [];
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
    legs: route.legs,
    route: route
  };
}

export const getRouteBetween = getRoute;